"""
RS Dataset Factory - GPT 视觉引导的边界精修服务

工作流：
  1. 将原图 + 当前 mask 合成为对比图发送给 GPT 视觉模型
  2. 让 GPT 阅读图像，针对 *目标类别* 输出：
       - 错误区域的 bounding box（归一化坐标）
       - 每个 bbox 的标签：True=应是目标类（增加），False=不应是目标类（删除）
       - 推荐的精修文本提示词（例如 "swimming pool water"）
  3. 对每个 bbox：
       - 用 SAM3 box prompt + 精修文本 → 获取该区域的精确 mask
       - 在 bbox 内：True 标签 → 设为目标类；False 标签 → 移除目标类
  4. 对全图也做一次 SAM3 整体精修（用 GPT 推荐的提示词）作为兜底
  5. 形态学清理 → 合并回原 mask
"""
import os
import io
import re
import json
import base64
import logging
from typing import Dict, List, Optional, Tuple
import numpy as np
import torch
import httpx
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

CHAT_API_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
CHAT_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
VISION_MODEL = os.environ.get("VISION_MODEL", os.environ.get("CHAT_MODEL", "gpt-4o-mini"))


# ================================================================
# 图像准备：原图 + 单类 mask 高亮 + 网格标尺
# ================================================================
def _build_class_overlay(
    image_rgb: np.ndarray,
    original_mask: np.ndarray,
    target_class_idx: int,
    target_class_name: str,
    target_color: Tuple[int, int, int] = (255, 80, 80),
) -> Tuple[Image.Image, Tuple[int, int]]:
    """
    生成发送给 GPT 的对比图：
      [LEFT]  原图（带网格标尺，0-100%坐标）
      [RIGHT] 目标类别高亮（红色覆盖）+ 网格

    返回:
      合成 PIL Image, (合成图宽, 合成图高)
    """
    h, w = image_rgb.shape[:2]
    img_pil = Image.fromarray(image_rgb).convert("RGB")

    # 单类二值 mask
    bin_mask = (original_mask == target_class_idx)
    overlay_arr = image_rgb.copy()
    if bin_mask.any():
        # 半透明红色覆盖
        red = np.zeros_like(image_rgb)
        red[:, :] = target_color
        alpha = 0.55
        idx = bin_mask
        overlay_arr[idx] = (image_rgb[idx] * (1 - alpha) + red[idx] * alpha).astype(np.uint8)

    # 添加边缘描边
    try:
        import cv2
        edges = cv2.dilate(bin_mask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1) - bin_mask.astype(np.uint8)
        overlay_arr[edges > 0] = (255, 255, 255)
    except Exception:
        pass

    overlay_pil = Image.fromarray(overlay_arr).convert("RGB")

    # 缩放到 768 宽
    target_w = 768
    scale = target_w / w
    target_h = int(h * scale)
    p1 = img_pil.resize((target_w, target_h), Image.LANCZOS)
    p2 = overlay_pil.resize((target_w, target_h), Image.LANCZOS)

    # 添加网格标尺：每 10% 一条浅线，10% 处标注百分比
    def _draw_grid(img: Image.Image):
        d = ImageDraw.Draw(img, "RGBA")
        ww, hh = img.size
        try:
            font = ImageFont.truetype("arial.ttf", 11)
        except Exception:
            font = ImageFont.load_default()
        for pct in range(0, 101, 10):
            x = int(ww * pct / 100)
            y = int(hh * pct / 100)
            d.line([(x, 0), (x, hh)], fill=(255, 255, 255, 60), width=1)
            d.line([(0, y), (ww, y)], fill=(255, 255, 255, 60), width=1)
            if pct % 20 == 0 and pct > 0 and pct < 100:
                d.text((x + 2, 2), f"{pct}", fill=(255, 255, 200, 200), font=font)
                d.text((2, y + 2), f"{pct}", fill=(255, 255, 200, 200), font=font)
        # 边框
        d.rectangle([0, 0, ww - 1, hh - 1], outline=(255, 255, 255, 160), width=2)

    _draw_grid(p1)
    _draw_grid(p2)

    # 拼接（横向）
    gap = 8
    title_h = 28
    canvas_w = target_w * 2 + gap
    canvas_h = title_h + target_h
    canvas = Image.new("RGB", (canvas_w, canvas_h), (16, 24, 40))
    canvas.paste(p1, (0, title_h))
    canvas.paste(p2, (target_w + gap, title_h))

    d = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    d.text((6, 6), "[LEFT] Original RGB (with 0-100% grid)", fill=(180, 220, 255), font=font)
    d.text((target_w + gap + 6, 6), f"[RIGHT] Current mask of '{target_class_name}' (red = predicted)", fill=(255, 200, 200), font=font)

    return canvas, (target_w, target_h)


def _encode_image_b64(img: Image.Image) -> str:
    if img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ================================================================
# GPT 提示词
# ================================================================
GPT_BOUNDARY_SYSTEM = """You are a remote sensing expert helping refine the segmentation of a SINGLE target class.

You will receive a side-by-side image:
- LEFT: original RGB aerial photo with a 0-100% grid overlay
- RIGHT: the same image with the CURRENT predicted mask of the target class shown in red (with white edges)

Your job: identify SPECIFIC regions where the current red mask is wrong, and propose corrections.

Output STRICT JSON (no markdown, no prose) with this schema:
{
  "global_text_prompt": "<2-6 English words best describing the target class as it appears in this image>",
  "global_quality": "good" | "fair" | "poor",
  "corrections": [
    {
      "bbox_pct": [x1_pct, y1_pct, x2_pct, y2_pct],
      "label": "add" | "remove",
      "local_text_prompt": "<2-6 English words; what's actually in this box>",
      "confidence": 0.0-1.0,
      "reason": "<short Chinese reason>"
    }
  ]
}

Rules:
- bbox_pct values are percentages 0-100 of the image (NOT pixels). Use the visible grid for reference.
- "label=add": the box contains target-class objects that are MISSING from the red mask → should be added
- "label=remove": the box contains red pixels that should NOT be the target class → should be removed
- Keep boxes tight around the actual region of interest; do not output one giant box for the whole image
- Output AT MOST 8 corrections, prioritized by impact
- If quality is already "good", you may output an empty corrections list
- local_text_prompt should be optimized for SAM3 open-vocabulary inference
- All Chinese in "reason"; all English in prompts"""


# ================================================================
# 调用 GPT 提取 bbox 修正建议
# ================================================================
async def _call_gpt_for_corrections(
    image_rgb: np.ndarray,
    original_mask: np.ndarray,
    target_class_idx: int,
    target_class_name: str,
) -> Dict:
    """调用 GPT 视觉模型，返回 corrections JSON"""
    canvas, _ = _build_class_overlay(image_rgb, original_mask, target_class_idx, target_class_name)
    image_b64 = _encode_image_b64(canvas)

    user_text = (
        f"Target class: {target_class_name}\n\n"
        f"Identify regions where the red mask is wrong, output corrections JSON. "
        f"Use the 0-100% grid to estimate bbox coordinates."
    )

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": GPT_BOUNDARY_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                ],
            },
        ],
        "max_tokens": 2000,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    logger.info(f"[GPT Boundary] 调用 {VISION_MODEL}, target={target_class_name}")

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{CHAT_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {CHAT_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        if resp.status_code == 400 and "response_format" in resp.text:
            payload.pop("response_format", None)
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{CHAT_API_BASE}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {CHAT_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        if resp.status_code != 200:
            raise RuntimeError(f"GPT 调用失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    parsed = _parse_json(content)
    if parsed is None:
        raise RuntimeError(f"GPT 返回无法解析: {content[:300]}")

    parsed.setdefault("global_text_prompt", target_class_name)
    parsed.setdefault("global_quality", "fair")
    parsed.setdefault("corrections", [])
    parsed["_model"] = data.get("model", VISION_MODEL)
    parsed["_usage"] = data.get("usage", {})
    return parsed


def _parse_json(text: str) -> Optional[Dict]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                pass
    return None


# ================================================================
# 用 SAM3 box prompt 在指定 bbox 内做精确分割
# ================================================================
def _sam3_box_segment(
    image_rgb: np.ndarray,
    bbox_pct: List[float],
    text_prompt: str,
    predictor,
) -> Tuple[np.ndarray, float]:
    """
    在原图给定 bbox（百分比坐标）内运行 SAM3：
      - 设置文本提示
      - 添加 box prompt（SAM3 期望 [cx, cy, w, h] 归一化到 [0,1]）
    返回 (二值 mask 全图大小, presence_score)
    """
    h, w = image_rgb.shape[:2]
    x1p, y1p, x2p, y2p = bbox_pct
    x1p = max(0, min(100, x1p))
    y1p = max(0, min(100, y1p))
    x2p = max(0, min(100, x2p))
    y2p = max(0, min(100, y2p))
    if x2p <= x1p or y2p <= y1p:
        return np.zeros((h, w), dtype=bool), 0.0

    # 归一化中心+宽高
    cx = (x1p + x2p) / 2 / 100.0
    cy = (y1p + y2p) / 2 / 100.0
    bw = (x2p - x1p) / 100.0
    bh = (y2p - y1p) / 100.0

    img_pil = Image.fromarray(image_rgb)
    with torch.no_grad(), torch.autocast(device_type="cuda", dtype=torch.bfloat16):
        state = predictor.processor.set_image(img_pil)
        predictor.processor.reset_all_prompts(state)
        state = predictor.processor.set_text_prompt(state=state, prompt=text_prompt)
        state = predictor.processor.add_geometric_prompt(box=[cx, cy, bw, bh], label=True, state=state)

        ps = float(state.get("presence_score", torch.tensor(0.0)).item())
        sem = state["semantic_mask_logits"].squeeze()
        if sem.shape[-2:] != (h, w):
            sem = torch.nn.functional.interpolate(
                sem.view(1, 1, *sem.shape[-2:]),
                size=(h, w),
                mode="bilinear",
                align_corners=False,
            ).squeeze()

        # 用 instance branch 取最大值（如果有）
        if state.get("masks_logits") is not None and state["masks_logits"].shape[0] > 0:
            best_inst = None
            best_score = -1.0
            for i in range(state["masks_logits"].shape[0]):
                s = float(state["object_score"][i])
                if s > best_score:
                    best_score = s
                    best_inst = state["masks_logits"][i].squeeze()
            if best_inst is not None:
                if best_inst.shape[-2:] != (h, w):
                    best_inst = torch.nn.functional.interpolate(
                        best_inst.view(1, 1, *best_inst.shape[-2:]),
                        size=(h, w),
                        mode="bilinear",
                        align_corners=False,
                    ).squeeze()
                sem = torch.maximum(sem.float(), best_inst.float() * best_score)

    bin_mask = (sem > 0).cpu().numpy()

    # 限制到 bbox 内（GPT 指定的边界框是先验信息）
    bbox_mask = np.zeros((h, w), dtype=bool)
    x1 = int(x1p / 100 * w)
    y1 = int(y1p / 100 * h)
    x2 = int(x2p / 100 * w)
    y2 = int(y2p / 100 * h)
    bbox_mask[y1:y2, x1:x2] = True

    return bin_mask & bbox_mask, ps


# ================================================================
# 主入口（被 refine_service.refine_class 调用）
# ================================================================
def refine_via_gpt_boundary(
    image_rgb: np.ndarray,
    invalid_mask: np.ndarray,
    original_mask: np.ndarray,
    target_class_idx: int,
    target_class_name: str,
    refiner: Dict,
    extra_context: Dict,
    progress_callback=None,
) -> Tuple[np.ndarray, Dict]:
    """
    GPT 视觉引导的边界精修（同步调用，但内部调用 GPT 是异步的，需要事件循环）。
    """
    import asyncio
    from backend.config import MODEL_CONFIG
    from backend.core.predictor import get_predictor
    from backend.services.refine_service import _binary_morphology, _merge_refined_into_mask

    if progress_callback:
        progress_callback(1, 10, "正在准备图像并调用 GPT 视觉模型...")

    # 1. 调用 GPT 获取 corrections
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        gpt_result = loop.run_until_complete(
            _call_gpt_for_corrections(
                image_rgb=image_rgb,
                original_mask=original_mask,
                target_class_idx=target_class_idx,
                target_class_name=target_class_name,
            )
        )
    finally:
        try:
            loop.close()
        except Exception:
            pass

    print(f"[GPT Boundary] global_quality={gpt_result.get('global_quality')}, "
          f"global_prompt={gpt_result.get('global_text_prompt')}, "
          f"corrections={len(gpt_result.get('corrections', []))}")

    if progress_callback:
        progress_callback(3, 10, f"GPT 返回 {len(gpt_result.get('corrections', []))} 个修正建议")

    # 2. 加载 SAM3 predictor
    predictor = get_predictor(
        bpe_path=MODEL_CONFIG["bpe_path"],
        checkpoint_path=MODEL_CONFIG["checkpoint_path"],
        device=MODEL_CONFIG["device"],
        confidence_threshold=MODEL_CONFIG["confidence_threshold"],
    )

    h, w = image_rgb.shape[:2]
    add_mask = np.zeros((h, w), dtype=bool)
    remove_mask = np.zeros((h, w), dtype=bool)

    # 注意：不做全图精修。GPT 是"主导"——只在 GPT 明确指出的 bbox 内做精修。
    # 这样 GPT 没提到的区域保持原 mask 不变，避免 binary argmax 对 RS 大图过度分类。
    global_prompt = gpt_result.get("global_text_prompt", target_class_name).strip() or target_class_name

    # 4. 逐个 bbox 精修
    corrections = gpt_result.get("corrections", []) or []
    box_stats = []
    for idx, corr in enumerate(corrections):
        if progress_callback:
            progress_callback(5 + idx, 10 + len(corrections), f"处理第 {idx + 1}/{len(corrections)} 个 bbox 修正")
        bbox = corr.get("bbox_pct")
        label = corr.get("label", "add").lower()
        local_prompt = (corr.get("local_text_prompt") or global_prompt).strip()
        if not bbox or len(bbox) != 4 or not local_prompt:
            continue
        try:
            bin_in_box, ps = _sam3_box_segment(
                image_rgb=image_rgb,
                bbox_pct=bbox,
                text_prompt=local_prompt,
                predictor=predictor,
            )
            bin_in_box = bin_in_box & ~invalid_mask
            if label == "add":
                add_mask |= bin_in_box
            else:
                remove_mask |= bin_in_box
            box_stats.append({
                "bbox_pct": bbox,
                "label": label,
                "prompt": local_prompt,
                "presence": ps,
                "pixels": int(bin_in_box.sum()),
                "reason": corr.get("reason", ""),
                "confidence": corr.get("confidence", 0.0),
            })
        except Exception as e:
            print(f"[GPT Boundary] bbox {idx} 失败: {e}")

    # 5. 合成精修后的二值 mask
    target_was = original_mask == target_class_idx
    refined_binary = (target_was | add_mask) & ~remove_mask
    refined_binary = refined_binary & ~invalid_mask

    # 6. 形态学清理
    refined_binary = _binary_morphology(refined_binary, refiner["post_process"])
    refined_binary = refined_binary & ~invalid_mask

    if progress_callback:
        progress_callback(9, 10, "合并精修结果到原 mask...")

    new_mask, info = _merge_refined_into_mask(
        original_mask=original_mask,
        refined_binary=refined_binary,
        target_class_idx=target_class_idx,
        refiner=refiner,
        extra_info={
            "gpt_global_prompt": global_prompt,
            "gpt_global_quality": gpt_result.get("global_quality"),
            "gpt_corrections_count": len(corrections),
            "gpt_box_stats": box_stats,
            "gpt_model": gpt_result.get("_model"),
            "gpt_usage": gpt_result.get("_usage"),
        },
    )

    return new_mask, info
