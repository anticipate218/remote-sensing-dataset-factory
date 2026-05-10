"""
RS Dataset Factory - AI 视觉智能诊断与修正服务
使用 OpenAI 兼容的视觉大语言模型（GPT-5.4 系列）对分割结果进行：
1. 整体质量评估
2. 按类别诊断
3. 提示词优化建议
4. 推荐修正动作（精修器 / 手动关注 / 重新预测）
"""
import os
import io
import re
import json
import base64
import logging
from typing import Dict, List, Optional, Tuple
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import httpx

logger = logging.getLogger(__name__)

# ================================================================
# 配置：OpenAI 兼容代理
# ================================================================
CHAT_API_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
CHAT_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
VISION_MODEL = os.environ.get("VISION_MODEL", os.environ.get("CHAT_MODEL", "gpt-4o-mini"))


# ================================================================
# 图像准备
# ================================================================
def _resize_for_vision(img: Image.Image, max_size: int = 768) -> Image.Image:
    """缩放到 max_size 内，保持比例。视觉模型对小图也能理解全局结构。"""
    w, h = img.size
    if max(w, h) <= max_size:
        return img
    if w >= h:
        new_w = max_size
        new_h = int(h * max_size / w)
    else:
        new_h = max_size
        new_w = int(w * max_size / h)
    return img.resize((new_w, new_h), Image.LANCZOS)


def _encode_image_b64(img: Image.Image, fmt: str = "JPEG", quality: int = 85) -> str:
    """PIL Image → base64 编码字符串"""
    if fmt.upper() == "JPEG" and img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=quality if fmt.upper() == "JPEG" else None)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def build_diagnostic_image(
    original_path: str,
    color_mask_path: str,
    classes: List[str],
    palette: List[List[int]],
    output_size: int = 768,
) -> Tuple[Image.Image, str]:
    """
    生成用于 AI 诊断的合成图像：
      [左] 原图
      [中] 彩色 mask
      [右] 原图 + mask 半透明叠加
    底部附图例。

    Returns:
        (合成 PIL Image, 图例文本)
    """
    original = Image.open(original_path).convert("RGB")
    color_mask = Image.open(color_mask_path).convert("RGB")

    # 对齐尺寸
    if color_mask.size != original.size:
        color_mask = color_mask.resize(original.size, Image.NEAREST)

    # 生成叠加图（30% 原图 + 70% mask 颜色，但保留亮度）
    overlay = Image.blend(original, color_mask, alpha=0.55)

    # 缩放每个面板
    w, h = original.size
    target_w = output_size
    scale = target_w / w
    target_h = int(h * scale)

    panel_size = (target_w, target_h)
    p1 = original.resize(panel_size, Image.LANCZOS)
    p2 = color_mask.resize(panel_size, Image.NEAREST)
    p3 = overlay.resize(panel_size, Image.LANCZOS)

    # 拼接（横向）
    gap = 8
    title_h = 24
    legend_h = max(40, len(classes) * 6 + 20)
    canvas_w = target_w * 3 + gap * 2
    canvas_h = title_h + target_h + legend_h
    canvas = Image.new("RGB", (canvas_w, canvas_h), (16, 24, 40))

    canvas.paste(p1, (0, title_h))
    canvas.paste(p2, (target_w + gap, title_h))
    canvas.paste(p3, (target_w * 2 + gap * 2, title_h))

    # 添加面板标题
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
        font_small = ImageFont.truetype("arial.ttf", 11)
    except Exception:
        font = ImageFont.load_default()
        font_small = ImageFont.load_default()

    titles = ["[LEFT] Original RGB", "[MIDDLE] Predicted Mask (color)", "[RIGHT] Overlay"]
    for i, title in enumerate(titles):
        draw.text((target_w * i + gap * i + 6, 4), title, fill=(180, 220, 255), font=font)

    # 图例
    legend_y0 = title_h + target_h + 4
    draw.text((6, legend_y0), "Class Legend (index : color : name):", fill=(200, 220, 255), font=font_small)

    legend_lines = []
    for i, cls in enumerate(classes):
        color = tuple(palette[i]) if i < len(palette) else (0, 0, 0)
        # 矩形 + 文字
        x_off = 6 + (i % 6) * 165
        y_off = legend_y0 + 18 + (i // 6) * 16
        draw.rectangle([x_off, y_off, x_off + 12, y_off + 12], fill=color, outline=(220, 220, 220))
        draw.text((x_off + 16, y_off - 1), f"{i}:{cls}", fill=(220, 230, 245), font=font_small)
        legend_lines.append(f"{i}: {cls} (RGB={color})")

    return canvas, "\n".join(legend_lines)


# ================================================================
# AI 诊断（结构化 JSON 输出）
# ================================================================
def _build_diagnose_system_prompt() -> str:
    """动态构建系统提示，注入当前可用的精修器列表（按 category + tier 分组，方便 GPT 优先选择类别专属模型）

    ⚠️ 维护提示：本函数最终的 prompt 文本是一个 **f-string**！
       任何在 prompt 文本内出现的字面 `{...}` 都必须写成 `{{...}}`，
       否则 Python 会把它当成表达式去求值，引发 NameError（曾经的 bug：
       `{fair, poor, missing}` 被当成集合字面量去找 `fair` 变量）。
       唯二允许的单层 `{xxx}` 占位符是函数末尾真正用到的：`{refiners_str}`。
    """
    try:
        from backend.services.refine_service import REFINER_REGISTRY

        # 按 category 分组，再按 tier 排序（Tier 1 优先）
        from collections import defaultdict
        by_cat: Dict[str, List[Dict]] = defaultdict(list)
        for r in REFINER_REGISTRY.values():
            by_cat[r.get("category", "any")].append(r)
        for cat in by_cat:
            by_cat[cat].sort(key=lambda x: x.get("tier", 99))

        # 类别中文映射
        cat_cn = {
            "building": "建筑物 (building / house / roof)",
            "road": "道路 (road / street / highway)",
            "water": "水体 (water / river / lake / pond)",
            "vegetation": "植被 (tree / forest / grass / shrub)",
            "farmland": "农田 (farmland / cropland / paddy / field)",
            "any": "通用/任意类别 (cross-category)",
        }

        sections = []
        # 先列出类别专属（building/road/water/vegetation/farmland）
        for cat in ["building", "road", "water", "vegetation", "farmland"]:
            if cat not in by_cat:
                continue
            lines = [f"\n  ## {cat_cn.get(cat, cat).upper()}"]
            for r in by_cat[cat]:
                arch = r.get("architecture", "").split("(")[0].strip() or r.get("inference_method", "")
                tier_label = {1: "T1 PRISM-A (★ 优选-本地权重)", 2: "T2 SOTA (HuggingFace)", 3: "T3 AI Vision"}.get(r.get("tier"), f"T{r.get('tier')}")
                lines.append(
                    f"    - id=\"{r['id']}\"  [{tier_label}]  arch={arch}"
                )
            sections.append("\n".join(lines))
        # 通用兜底
        if "any" in by_cat:
            lines = ["\n  ## CROSS-CATEGORY (use only when no class-specific refiner fits)"]
            for r in by_cat["any"]:
                arch = r.get("architecture", "").split("(")[0].strip()
                tier_label = {1: "T1 PRISM-A", 2: "T2 SOTA", 3: "T3 AI Vision"}.get(r.get("tier"), f"T{r.get('tier')}")
                lines.append(
                    f"    - id=\"{r['id']}\"  [{tier_label}]  arch={arch}"
                )
            sections.append("\n".join(lines))
        refiners_str = "".join(sections)
    except Exception:
        refiners_str = "  - (failed to load registry; use category names like 'building', 'road', 'water', 'vegetation', 'farmland', 'ai_gpt_boundary')"

    return f"""You are an expert remote sensing image analyst evaluating semantic segmentation quality on aerial/satellite imagery.

You will receive a composite image showing:
- LEFT: the original RGB aerial photo
- MIDDLE: the predicted segmentation mask in pseudo-color
- RIGHT: the overlay of mask on original
- A class legend mapping class indices to colors

Your task: critically evaluate the segmentation quality and recommend concrete corrections. Be specific and grounded in what you actually observe.

Output STRICT JSON (no markdown, no prose) with this exact schema:
{{
  "overall_quality": "excellent" | "good" | "fair" | "poor",
  "overall_score": 0-100,
  "summary": "1-2 sentence overall assessment in Chinese",
  "per_class_assessment": [
    {{
      "class_name": "<one of the legend classes>",
      "quality": "good" | "fair" | "poor" | "missing",
      "issue": "<short Chinese description, or empty string if good>",
      "estimated_iou": 0.0-1.0
    }}
  ],
  "recommended_actions": [
    {{
      "type": "improve_prompt",
      "class_name": "<class>",
      "current_prompt": "<old prompt if known, else empty>",
      "suggested_prompt": "<new English text prompt for SAM3>",
      "reason": "<Chinese reason>",
      "priority": "high" | "medium" | "low"
    }},
    {{
      "type": "refine_class",
      "class_name": "<class>",
      "refiner_id": "<one of the available refiner ids below>",
      "reason": "<Chinese reason>",
      "priority": "high" | "medium" | "low"
    }},
    {{
      "type": "manual_attention",
      "region": "<top-left|top-right|bottom-left|bottom-right|center|left-half|right-half>",
      "issue": "<Chinese description of what's wrong>",
      "priority": "high" | "medium" | "low"
    }},
    {{
      "type": "missing_class",
      "suggested_class": "<English name>",
      "suggested_prompt": "<English text prompt>",
      "reason": "<what you see that isn't in the legend, in Chinese>",
      "priority": "high" | "medium" | "low"
    }}
  ]
}}

Available refiner_ids (organized by CATEGORY → TIER. **Use the EXACT id**):
{refiners_str}

Rules:
- ⚠️ CLASS PRESENCE: When the user message provides "PRE-COMPUTED MASK STATISTICS", treat the PRESENT list as the source of truth. Ignore LIKELY ABSENT classes UNLESS you visibly see them in the LEFT panel being missed (in which case quality="missing").
- ⚠️ COVERAGE RULE: `per_class_assessment` MUST include EVERY class from the PRESENT list — do NOT skip any present class. For each present class explicitly state quality (good/fair/poor) with a 1-sentence Chinese reason.
- ⚠️ ABSENT CLASSES FORBIDDEN: do NOT add absent classes to per_class_assessment (they will be filtered out anyway).
- ⚠️ ACTION COVERAGE: For EVERY class in PRESENT with quality ∈ {{fair, poor, missing}}, you MUST generate at least ONE corresponding action (either `refine_class` OR `improve_prompt`). Do NOT silently skip a present-but-imperfect class.
- recommended_actions can be empty ONLY if every present class is "good".
- ⚠️ NEVER recommend `refine_class` or `improve_prompt` for a class that is NOT actually visible in the image (this only causes false positives).
- Suggested prompts should be 2-6 English words optimized for open-vocabulary SAM3.
- Be honest: if mask shows random noise, give "poor" quality and explain.

⚠️⚠️⚠️ CRITICAL: REFINER SELECTION POLICY ⚠️⚠️⚠️
For each `refine_class` action, you MUST follow this STRICT priority order:

1. **FIRST CHOICE — class-specific Tier 1 PRISM-A** (e.g. for class_name containing "building/house/roof" → use `building_prism`; for "road/street/highway" → use `road_prism`; etc.)
   This is the BEST option because it runs locally on SegEarth-OV-3 weights with hand-tuned domain prompts. Always prefer this when available.

2. **SECOND CHOICE — class-specific Tier 2 SOTA** (e.g. `building_mask2former_ade`, `road_mask2former_ade`)
   Use only if Tier 1 PRISM-A has known weakness for this class (e.g. tiny dispersed objects, very thin lines).

3. **THIRD CHOICE — `ai_gpt_boundary` (Tier 3)**
   Use ONLY for: (a) categories with no class-specific refiner (e.g. "vehicle", "ship", "solar_panel", "greenhouse"), or (b) when the issue is purely BOUNDARY noise (jagged edges, holes) and not a structural mis-segmentation.

4. NEVER recommend `general_segformer_ade` (Tier 2-B) unless you've already tried both class-specific Tier 1 AND Tier 2 and both clearly failed.

📋 EXAMPLES OF GOOD REFINER MAPPING:
- class_name="building" + quality="poor" → refiner_id="building_prism" (★ ALWAYS)
- class_name="road" + quality="fair" → refiner_id="road_prism" (★ ALWAYS)
- class_name="water" + quality="poor" → refiner_id="water_prism"
- class_name="forest" or "vegetation" + quality="fair" → refiner_id="vegetation_prism"
- class_name="farmland" or "rice_paddy" → refiner_id="farmland_prism"
- class_name="vehicle" or "ship" or "solar_panel" → refiner_id="ai_gpt_boundary" (no class-specific refiner)
- class_name="building" + edges only need smoothing → refiner_id="ai_gpt_boundary" is OK as fallback

❌ BAD EXAMPLES (DO NOT DO THIS):
- class_name="building" → refiner_id="ai_gpt_boundary" ❌ (you skipped the class-specific building_prism!)
- class_name="road" → refiner_id="general_segformer_ade" ❌ (use road_prism first!)
- class_name="water" → refiner_id="building_prism" ❌ (mismatched category!)"""


def compute_class_presence(
    mask_path: str,
    classes: List[str],
    bg_idx: int = 0,
    absent_ratio_threshold: float = 0.003,  # <0.3% 像素 → 实际未检出
) -> Dict:
    """
    从原始 mask（每像素 class id）计算每个类别的像素占比，识别实际"在场"的类别。
    
    返回:
      {
        "total_pixels": int,
        "per_class": [
          {"index": i, "name": "...", "pixel_count": N, "ratio": 0.0-1.0, "present": bool}
        ],
        "present_indices": [i, ...],     # 占比 >= threshold 的类别索引
        "absent_indices":  [i, ...],     # 占比 < threshold 的类别索引（含 0 像素）
        "background_index": bg_idx,
      }
    
    "present" 的定义：mask 中该类别像素占比 >= absent_ratio_threshold（默认 0.3%）。
    背景类（bg_idx）不参与 present/absent 判定，单独返回 background_pixels。
    """
    if not os.path.exists(mask_path):
        return {
            "total_pixels": 0,
            "per_class": [],
            "present_indices": [],
            "absent_indices": [],
            "background_index": bg_idx,
            "error": f"mask 不存在: {mask_path}",
        }
    try:
        mask = np.array(Image.open(mask_path).convert("L"), dtype=np.uint8)
    except Exception as e:
        return {
            "total_pixels": 0,
            "per_class": [],
            "present_indices": [],
            "absent_indices": [],
            "background_index": bg_idx,
            "error": f"读取 mask 失败: {e}",
        }
    total = int(mask.size)
    counts = np.bincount(mask.flatten(), minlength=max(len(classes), int(mask.max()) + 1))
    
    per_class = []
    present_indices = []
    absent_indices = []
    for i, name in enumerate(classes):
        cnt = int(counts[i]) if i < len(counts) else 0
        ratio = cnt / total if total > 0 else 0.0
        # 背景类不算 present/absent
        is_bg = (i == bg_idx) or (str(name).lower() in ("background", "bg", "void", "unknown"))
        is_present = (not is_bg) and (ratio >= absent_ratio_threshold)
        per_class.append({
            "index": i,
            "name": name,
            "pixel_count": cnt,
            "ratio": round(ratio, 5),
            "ratio_pct": round(ratio * 100, 3),
            "present": is_present,
            "is_background": is_bg,
        })
        if is_bg:
            continue
        if is_present:
            present_indices.append(i)
        else:
            absent_indices.append(i)
    
    return {
        "total_pixels": total,
        "per_class": per_class,
        "present_indices": present_indices,
        "absent_indices": absent_indices,
        "background_index": bg_idx,
        "absent_ratio_threshold": absent_ratio_threshold,
    }


async def diagnose(
    original_path: str,
    color_mask_path: str,
    classes: List[str],
    palette: List[List[int]],
    current_prompts: Optional[Dict[str, str]] = None,
    mask_path: Optional[str] = None,
    absent_ratio_threshold: float = 0.003,
) -> Dict:
    """
    使用视觉大语言模型对分割结果进行诊断。
    返回结构化 JSON 报告。
    
    新增逻辑（v2）：
      - 如果传入 mask_path（原始单通道类别 mask），先计算每类像素占比，
        识别"图中实际不存在"的类别（占比 < absent_ratio_threshold 默认 0.3%）。
      - 把"已知不存在"的类别明确告知 GPT，让它跳过这些类别的 per_class_assessment 与
        improve_prompt / refine_class 建议（除非它在原图里真的看到了被漏掉）。
      - 输出额外字段 `presence_stats` 让前端展示 absent classes。
    """
    if not os.path.exists(original_path):
        raise FileNotFoundError(f"原图不存在: {original_path}")
    if not os.path.exists(color_mask_path):
        raise FileNotFoundError(f"彩色 mask 不存在: {color_mask_path}")

    # 0. 计算类别在场状态（如果有 mask_path）
    presence_stats = None
    if mask_path and os.path.exists(mask_path):
        presence_stats = compute_class_presence(
            mask_path, classes, bg_idx=0, absent_ratio_threshold=absent_ratio_threshold,
        )
        logger.info(
            f"[AI Diagnose] presence: present={len(presence_stats['present_indices'])} "
            f"absent={len(presence_stats['absent_indices'])} of {len(classes)}"
        )

    # 1. 构建诊断图
    canvas, legend = build_diagnostic_image(original_path, color_mask_path, classes, palette)
    canvas = _resize_for_vision(canvas, max_size=1280)
    image_b64 = _encode_image_b64(canvas, fmt="JPEG", quality=85)

    # 2. 构建用户提示
    prompts_section = ""
    if current_prompts:
        prompts_section = "\n\n当前使用的英文提示词（class -> prompt）：\n"
        for cls, prm in current_prompts.items():
            prompts_section += f"  - {cls}: \"{prm}\"\n"

    # presence 提示：明确告诉 GPT 哪些类没有出现在 mask 里
    presence_section = ""
    if presence_stats:
        present_names = [classes[i] for i in presence_stats["present_indices"] if i < len(classes)]
        absent_names = [classes[i] for i in presence_stats["absent_indices"] if i < len(classes)]
        present_with_pct = [
            f"{c['name']} ({c['ratio_pct']}%)"
            for c in presence_stats["per_class"]
            if c["present"]
        ]
        # absent 详情
        absent_lines = []
        for c in presence_stats["per_class"]:
            if not c["present"] and not c["is_background"]:
                absent_lines.append(f"  - \"{c['name']}\" (mask 像素 {c['pixel_count']} = {c['ratio_pct']}%)")
        absent_block = "\n".join(absent_lines) if absent_lines else "  (none)"

        presence_section = f"""

== PRE-COMPUTED MASK STATISTICS (use this to filter your output) ==
Image total pixels: {presence_stats['total_pixels']}
Threshold for "present": >= {absent_ratio_threshold * 100:.1f}% of pixels

PRESENT classes ({len(present_names)} of {len(classes)} legend classes):
  {', '.join(present_with_pct) if present_with_pct else '(none — mask is empty)'}

LIKELY ABSENT classes (mask has < {absent_ratio_threshold * 100:.1f}% pixels — almost certainly NOT in this image):
{absent_block}

CRITICAL INSTRUCTIONS:
1. ⚠️ COVERAGE: `per_class_assessment` MUST contain EVERY class from the PRESENT list above (no skipping). If you don't have an opinion on a class, still emit it with quality="good" + brief reason.
2. ⚠️ ACTIONS: For EVERY PRESENT class whose quality is fair/poor/missing, you MUST emit at least one matching action (refine_class with the correct class-specific Tier-1 PRISM id, or improve_prompt). Common categories like building/road/water/vegetation/farmland have dedicated *_prism refiners — USE THEM.
3. For LIKELY ABSENT classes, do NOT add them to per_class_assessment UNLESS you can clearly see in the LEFT panel that the class IS visible in the image but the model failed to detect it. In that rare case, mark quality="missing".
4. Do NOT generate `improve_prompt` or `refine_class` actions for LIKELY ABSENT classes.
5. Do NOT generate `missing_class` actions for things that are already in the LIKELY ABSENT list.
6. Focus your effort on PRESENT classes: building boundaries crisp? roads continuous? water edges clean? vegetation overgrown / undergrown? Do not silently ignore any PRESENT class.
"""

    user_text = (
        "请评估以下遥感图像分割质量，按规定的 JSON Schema 严格输出诊断报告：\n\n"
        f"类别图例（index : name）：\n{legend}\n"
        f"{prompts_section}"
        f"{presence_section}"
    )

    # 3. 调用视觉模型
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": _build_diagnose_system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            },
        ],
        "max_tokens": 2000,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    logger.info(f"[AI Diagnose] 调用 {VISION_MODEL}, 图像大小: {len(image_b64)} chars (b64)")

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
        # 部分代理不支持 response_format，fallback 重试
        if resp.status_code == 400 and "response_format" in resp.text:
            logger.warning("代理不支持 response_format，回退普通模式")
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
            raise RuntimeError(f"AI 调用失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"]

    # 4. 解析 JSON（容错：如果模型加了 markdown 标记则剥离）
    parsed = _parse_json_response(content)
    if parsed is None:
        raise RuntimeError(f"AI 返回内容无法解析为 JSON: {content[:500]}")

    parsed.setdefault("overall_quality", "fair")
    parsed.setdefault("overall_score", 50)
    parsed.setdefault("summary", "")
    parsed.setdefault("per_class_assessment", [])
    parsed.setdefault("recommended_actions", [])

    # === 后处理：根据 presence_stats 过滤 GPT 输出，防止它对不存在的类别还给建议 ===
    filtered_actions_dropped: List[Dict] = []
    if presence_stats:
        absent_set = {
            classes[i].lower() for i in presence_stats["absent_indices"] if i < len(classes)
        }
        # 1. 过滤 per_class_assessment：absent 类别只保留 quality="missing" 的（GPT 真的看见了被漏的）
        kept_assess = []
        for a in parsed.get("per_class_assessment", []):
            cn = str(a.get("class_name", "")).lower()
            quality = str(a.get("quality", "")).lower()
            if cn in absent_set and quality != "missing":
                # 自动改为 absent 状态条目（保留信息，但不算作"质量差"）
                a = {
                    **a,
                    "quality": "absent",
                    "issue": a.get("issue") or "图中未检出此类（mask 像素 < 0.3%），已自动跳过",
                    "estimated_iou": 0.0,
                    "_auto_filtered": True,
                }
            kept_assess.append(a)
        parsed["per_class_assessment"] = kept_assess

        # 2. 过滤 recommended_actions：删除针对 absent 类别的 improve_prompt / refine_class
        kept_actions = []
        for a in parsed.get("recommended_actions", []):
            atype = str(a.get("type", ""))
            cn = str(a.get("class_name", "")).lower()
            if atype in ("improve_prompt", "refine_class") and cn in absent_set:
                a["_dropped_reason"] = f"类别 \"{cn}\" 在图中实际不存在（mask 像素 < 0.3%），跳过此建议"
                filtered_actions_dropped.append(a)
                continue
            kept_actions.append(a)
        parsed["recommended_actions"] = kept_actions

    # === 自动补全：对每个 PRESENT 类别，如果 GPT 没给任何 action，且能匹配到 *_prism 精修器，就系统补一条 low-priority 建议 ===
    auto_added_actions: List[Dict] = []
    if presence_stats:
        try:
            from backend.services.refine_service import suggest_refiner_for_class, REFINER_REGISTRY
        except Exception:
            suggest_refiner_for_class = None
            REFINER_REGISTRY = {}

        present_idx = presence_stats.get("present_indices", []) or []
        present_names = [classes[i] for i in present_idx if i < len(classes)]

        # 查 per_class_assessment 中每个 present 类的 quality
        assess_by_name = {}
        for a in parsed.get("per_class_assessment", []):
            cn = str(a.get("class_name", "")).lower()
            assess_by_name[cn] = str(a.get("quality", "")).lower()

        # 已有 action 的 (class_name, type) 集合
        existing_action_classes = {
            (str(a.get("class_name", "")).lower(), str(a.get("type", "")))
            for a in parsed.get("recommended_actions", [])
        }
        # 只要某 class 已有 refine_class / improve_prompt，就视作已被覆盖
        covered_classes = {
            cn for (cn, atype) in existing_action_classes
            if atype in ("refine_class", "improve_prompt")
        }

        for cls_name in present_names:
            cn_lower = cls_name.lower()
            if cn_lower in covered_classes:
                continue  # GPT 已给建议，跳过

            # 尝试匹配类别专属 *_prism 精修器
            refiner_id = None
            if suggest_refiner_for_class:
                refiner_id = suggest_refiner_for_class(cls_name, "")
            if not refiner_id:
                # 兜底：如果完全没匹配（罕见类别），跳过 — 用户可手动用 ai_gpt_boundary
                continue
            refiner_meta = REFINER_REGISTRY.get(refiner_id, {}) if isinstance(REFINER_REGISTRY, dict) else {}
            refiner_name = refiner_meta.get("name", refiner_id)

            # 找到 mask 占比，用于解释为什么补这条
            ratio_pct = 0.0
            for c in presence_stats.get("per_class", []):
                if str(c.get("name", "")).lower() == cn_lower:
                    ratio_pct = c.get("ratio_pct", 0.0)
                    break

            quality = assess_by_name.get(cn_lower, "good")
            # 优先级映射：quality 差就 high，未评估或 good 就 low
            priority = "high" if quality in ("poor", "missing") else \
                       "medium" if quality == "fair" else "low"

            reason_parts = []
            if quality and quality != "good":
                reason_parts.append(f"GPT 评估为 \"{quality}\"")
            elif cn_lower not in assess_by_name:
                reason_parts.append("GPT 未单独评估此类别")
            else:
                reason_parts.append("可进一步优化边界精度")
            reason_parts.append(f"图中占 {ratio_pct:.1f}%")
            reason_parts.append(f"系统推荐使用 {refiner_name}")
            reason = "[系统补充建议] " + "，".join(reason_parts) + "。"

            new_action = {
                "type": "refine_class",
                "class_name": cls_name,
                "refiner_id": refiner_id,
                "reason": reason,
                "priority": priority,
                "_auto_added": True,
            }
            parsed.setdefault("recommended_actions", []).append(new_action)
            auto_added_actions.append(new_action)

        if auto_added_actions:
            logger.info(
                f"[AI Diagnose] 自动补全 {len(auto_added_actions)} 条 present-class 精修建议: "
                f"{[a['class_name'] + '→' + a['refiner_id'] for a in auto_added_actions]}"
            )

    return {
        "diagnosis": parsed,
        "model": data.get("model", VISION_MODEL),
        "usage": data.get("usage", {}),
        "presence_stats": presence_stats,
        "filtered_actions_dropped": filtered_actions_dropped,
        "auto_added_actions": auto_added_actions,
    }


# ================================================================
# 精修后 GPT 复查（before vs after）
# ================================================================
REVIEW_SYSTEM_PROMPT = """You are a remote sensing segmentation reviewer.
You will receive a SINGLE composite image showing a 3-panel comparison for ONE target class:
  - LEFT panel  : the original RGB aerial image
  - MIDDLE panel: BEFORE refinement (only the target class as a colored overlay)
  - RIGHT panel : AFTER refinement (only the target class as a colored overlay)

Decide whether the AFTER mask is BETTER, EQUAL, or WORSE than the BEFORE mask for the target class.

Output STRICT JSON only:
{
  "verdict": "better" | "equal" | "worse",
  "before_score": 0-100,
  "after_score": 0-100,
  "delta": -100 to 100,
  "issues_in_after": ["<short Chinese point>", ...],
  "summary": "<1-2 sentence Chinese summary>",
  "recommend_keep": true | false
}

Rules:
- recommend_keep = true ONLY if the AFTER is clearly better OR equal AND has no major artifacts
- If AFTER over-segments (covers far more area than visible target), set verdict=worse, recommend_keep=false
- If AFTER missed obvious target regions visible in original, deduct points heavily
- Be conservative: when uncertain, prefer recommend_keep=false"""


async def review_refinement(
    original_path: str,
    pre_mask_path: str,
    post_mask_path: str,
    target_class_idx: int,
    target_class_name: str,
    target_color: List[int],
) -> Dict:
    """
    精修后调用 GPT 视觉模型复查 BEFORE vs AFTER。
    返回 verdict / score / recommend_keep。
    """
    if not all(os.path.exists(p) for p in [original_path, pre_mask_path, post_mask_path]):
        raise FileNotFoundError("一或多个输入文件不存在")

    rgb = Image.open(original_path).convert("RGB")
    pre = np.array(Image.open(pre_mask_path).convert("L"))
    post = np.array(Image.open(post_mask_path).convert("L"))

    # 把 rgb 调整到 mask 大小
    h, w = pre.shape[:2]
    if rgb.size != (w, h):
        rgb = rgb.resize((w, h), Image.LANCZOS)
    rgb_arr = np.array(rgb)

    color = tuple(target_color[:3]) if len(target_color) >= 3 else (255, 0, 0)

    def overlay(mask: np.ndarray) -> Image.Image:
        out = rgb_arr.copy()
        m = mask == target_class_idx
        if m.any():
            blend = (
                out[m].astype(np.float32) * 0.35
                + np.array(color, dtype=np.float32) * 0.65
            ).clip(0, 255).astype(np.uint8)
            out[m] = blend
        return Image.fromarray(out)

    panel_w = max(min(w, 480), 240)
    panel_h = int(h * panel_w / w)
    titles = ["RGB", f"BEFORE ({target_class_name})", "AFTER"]
    panels = [rgb.resize((panel_w, panel_h), Image.LANCZOS),
              overlay(pre).resize((panel_w, panel_h), Image.LANCZOS),
              overlay(post).resize((panel_w, panel_h), Image.LANCZOS)]

    canvas = Image.new("RGB", (panel_w * 3 + 20, panel_h + 30), (15, 25, 45))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    for i, (img, title) in enumerate(zip(panels, titles)):
        x = i * (panel_w + 10) + 10
        canvas.paste(img, (x, 25))
        draw.text((x + 6, 4), title, fill=(116, 247, 253), font=font)

    image_b64 = _encode_image_b64(_resize_for_vision(canvas, max_size=1280), fmt="JPEG", quality=85)

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Target class: {target_class_name} (index={target_class_idx}, "
                            f"color RGB={color}). Compare BEFORE vs AFTER and decide."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            },
        ],
        "max_tokens": 600,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    logger.info(f"[GPT Review] 调用 {VISION_MODEL} 复查 {target_class_name}")
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{CHAT_API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {CHAT_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code != 200:
        if resp.status_code == 400 and "response_format" in resp.text:
            payload.pop("response_format", None)
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{CHAT_API_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {CHAT_API_KEY}", "Content-Type": "application/json"},
                    json=payload,
                )
        if resp.status_code != 200:
            raise RuntimeError(f"GPT 复查调用失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    parsed = _parse_json_response(content) or {}
    parsed.setdefault("verdict", "equal")
    parsed.setdefault("before_score", 50)
    parsed.setdefault("after_score", 50)
    parsed.setdefault("delta", parsed["after_score"] - parsed["before_score"])
    parsed.setdefault("issues_in_after", [])
    parsed.setdefault("summary", "")
    parsed.setdefault("recommend_keep", parsed["verdict"] != "worse")
    parsed["_model"] = data.get("model", VISION_MODEL)
    return parsed


def _parse_json_response(text: str) -> Optional[Dict]:
    """容错解析 JSON：剥离 markdown 围栏、提取首个 JSON 对象。"""
    text = text.strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return None


# ================================================================
# AI 识图生成预设模板（用户上传图像后，自动识别地物 → 推荐 PresetConfig）
# ================================================================
_PRESET_RECOMMEND_SYSTEM_PROMPT = """You are an expert remote sensing analyst.

Given a single aerial / satellite image, your task is to:
1. Identify the SCENE type (e.g. "urban dense city center", "rural agriculture", "coastal", "mountain forest", "industrial port", ...).
2. Recommend a list of 4–10 SEMANTIC CLASSES that are *actually visible* in this specific image and worth segmenting (do NOT include classes you can't see).
3. For each class give an English open-vocabulary prompt (2–6 words) suitable for SAM3 / SegEarth-OV-3.
4. For each class give a sensible RGB color (HEX, like "#FF6347") for visualization.
5. Estimate the area share (rough percentage 0–100) of each class in the image.

Output STRICT JSON (no markdown, no prose) with this EXACT schema:
{
  "scene_summary": "<1 short Chinese sentence describing the overall scene>",
  "scene_tag": "urban" | "rural" | "coastal" | "mountain" | "industrial" | "mixed",
  "confidence": 0.0-1.0,
  "preset_name": "<Chinese, e.g. '城市密集场景 (AI识别)'>",
  "preset_description": "<1 short Chinese sentence>",
  "classes": [
    {
      "name": "<English snake_case name, e.g. 'building'>",
      "prompt": "<2-6 English words for SAM3>",
      "color": "#RRGGBB",
      "area_share": 0-100,
      "reason_cn": "<1 short Chinese sentence why this class is needed>"
    }
  ]
}

Rules:
- Use STANDARD names: "building", "road", "water", "vegetation", "forest", "grass", "farmland", "rice_paddy", "bare_soil", "sand", "vehicle", "ship", "bridge", "parking_lot", "industrial", "residential", "solar_panel", "greenhouse", "shadow", etc.
- The first class is ALWAYS implicit "background" (you do NOT need to include it; the system adds it automatically).
- Do NOT pad with classes you don't actually see; 4-7 is usually best.
- Sort classes by area_share descending (largest first).
- Color suggestions: building=#FF3C3C-ish red, road=gray, water=blue, vegetation/forest=green, farmland=gold/yellow, bare_soil=brown.
- Be specific and grounded in what you actually observe."""


async def recommend_preset_from_image(
    image_path: str,
    max_size: int = 1024,
) -> Dict:
    """
    用 GPT Vision 分析单张图像，输出推荐的 PresetConfig（含 classes / prompts / palette）。
    返回:
      {
        "name": "...",
        "description": "...",
        "scene_tag": "...",
        "confidence": 0-1,
        "icon": "🤖",
        "tags": [...],
        "source": "AI Generated (GPT-5.5 Vision)",
        "classes": ["background", "<cls1>", "<cls2>", ...],
        "prompts": {"<cls>": "<prompt>", ...},
        "palette": [[0,0,0], [r,g,b], ...],
        "reasoning": "<scene_summary>",
        "detected_scene": "<scene_tag>",
        "raw": <full GPT response>
      }
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"图像不存在: {image_path}")

    img = Image.open(image_path).convert("RGB")
    img = _resize_for_vision(img, max_size=max_size)
    image_b64 = _encode_image_b64(img, fmt="JPEG", quality=85)

    user_text = (
        "请分析下面这张遥感影像，识别其中可见的地物类型，"
        "并按规定的 JSON Schema 推荐一份语义分割预设模板。"
        "请只列出图中**真实可见**的类别（不要凑数）。"
    )

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": _PRESET_RECOMMEND_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            },
        ],
        "max_tokens": 1500,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }

    logger.info(f"[AI Preset] 调用 {VISION_MODEL} 识别图像 {image_path} ({img.size})")

    async with httpx.AsyncClient(timeout=90.0) as client:
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
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    f"{CHAT_API_BASE}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {CHAT_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        if resp.status_code != 200:
            raise RuntimeError(f"AI 调用失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    parsed = _parse_json_response(content)
    if parsed is None:
        raise RuntimeError(f"AI 返回内容无法解析为 JSON: {content[:500]}")

    # 转换为 PresetConfig 兼容结构
    raw_classes: List[Dict] = parsed.get("classes", []) or []
    if not isinstance(raw_classes, list) or not raw_classes:
        raise RuntimeError("AI 未识别出任何有效类别")

    def _hex_to_rgb(hx: str) -> List[int]:
        try:
            hx = hx.strip().lstrip("#")
            if len(hx) == 3:
                hx = "".join(c * 2 for c in hx)
            return [int(hx[i : i + 2], 16) for i in (0, 2, 4)]
        except Exception:
            return [128, 128, 128]

    # 类名规整：转为 snake_case 英文
    def _normalize_name(name: str) -> str:
        if not isinstance(name, str):
            return "class"
        n = name.strip().lower()
        n = re.sub(r"[^a-z0-9_]+", "_", n)
        n = re.sub(r"_+", "_", n).strip("_")
        return n or "class"

    class_names: List[str] = ["background"]
    prompts: Dict[str, str] = {}
    palette: List[List[int]] = [[0, 0, 0]]
    reasons: List[Dict] = []

    seen = set(["background"])
    for c in raw_classes:
        if not isinstance(c, dict):
            continue
        nm = _normalize_name(str(c.get("name", "")))
        if not nm or nm in seen:
            continue
        seen.add(nm)
        prm = str(c.get("prompt", "") or nm).strip()
        col = c.get("color", "#888888")
        rgb = _hex_to_rgb(col) if isinstance(col, str) else [128, 128, 128]
        class_names.append(nm)
        prompts[nm] = prm
        palette.append(rgb)
        reasons.append({
            "name": nm,
            "prompt": prm,
            "color": col,
            "area_share": c.get("area_share", 0),
            "reason_cn": c.get("reason_cn", ""),
        })

    if len(class_names) < 2:
        raise RuntimeError("AI 识别到的可用类别不足 1 个")

    scene_tag = str(parsed.get("scene_tag", "mixed")).lower()
    confidence = parsed.get("confidence", 0.7)
    try:
        confidence = float(confidence)
    except Exception:
        confidence = 0.7

    return {
        "name": str(parsed.get("preset_name") or f"AI 智能识图预设 · {len(class_names) - 1} 类"),
        "description": str(parsed.get("preset_description") or parsed.get("scene_summary", "由 GPT-5.5 Vision 自动识别生成")),
        "classes": class_names,
        "prompts": prompts,
        "palette": palette,
        "scene_tag": scene_tag if scene_tag in ("urban", "rural", "coastal", "mountain", "industrial", "mixed") else "mixed",
        "icon": "🤖",
        "tags": ["AI 识别", scene_tag, f"{len(class_names) - 1}类"],
        "source": f"AI Generated ({data.get('model', VISION_MODEL)})",
        "reasoning": str(parsed.get("scene_summary", "")),
        "detected_scene": scene_tag,
        "confidence": confidence,
        "per_class_reasons": reasons,
        "model": data.get("model", VISION_MODEL),
        "usage": data.get("usage", {}),
    }
