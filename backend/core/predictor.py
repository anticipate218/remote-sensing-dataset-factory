"""
RS Dataset Factory - SAM3 / SegEarth-OV-3 預測器封裝

對齊 SegEarth-OV-3 官方策略：
- 預設策略 B（PRISM Dataset Creation）：與 prism_advanced_visualizations.py /
  create_jiangxi_dataset.py / create_ruichang_yongxiu_dataset.py 一致：
      crop_logit_c = semantic_mask_logits * presence_score
      all_logits[c]  = sum_over_crops(crop_logit_c) / count_mat
      prediction     = argmax(all_logits)
- 可選策略 A（完整 PRISM / segearthov3_segmentor.py）：
      crop_logit_c = max(masks_logits * object_score, semantic_mask_logits) * presence_score
"""
import os
import sys
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
from typing import Dict, List, Tuple, Callable, Optional
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))


class SAM3Predictor:
    """SAM3 / SegEarth-OV-3 模型預測器（嚴格對齊官方策略）"""

    def __init__(
        self,
        bpe_path: str,
        checkpoint_path: str,
        device: str = "cuda",
        confidence_threshold: float = 0.1,
    ):
        self.device = device
        self.confidence_threshold = confidence_threshold
        self.processor = None
        self.model = None

        self._load_model(bpe_path, checkpoint_path)

    def _load_model(self, bpe_path: str, checkpoint_path: str):
        """加載 SAM3 模型"""
        from sam3 import build_sam3_image_model
        from sam3.model.sam3_image_processor import Sam3Processor

        self.model = build_sam3_image_model(
            bpe_path=bpe_path,
            checkpoint_path=checkpoint_path,
            device=self.device,
        )
        self.processor = Sam3Processor(
            self.model,
            confidence_threshold=self.confidence_threshold,
            device=self.device,
        )

    def _compute_query_logit(
        self,
        state: dict,
        target_h: int,
        target_w: int,
        use_sem_seg: bool,
        use_transformer_decoder: bool,
    ) -> torch.Tensor:
        """
        對單個 text query 計算融合後的 logits（不含 presence_score 調制）

        融合規則（對齊 segearthov3_segmentor.py:_inference_single_view）：
            seg_logit = 0
            if use_transformer_decoder:
                for inst in instances:
                    seg_logit = max(seg_logit, inst_logits * object_score)
            if use_sem_seg:
                seg_logit = max(seg_logit, semantic_mask_logits)
        """
        seg_logit = torch.zeros((target_h, target_w), device=self.device, dtype=torch.float32)

        # 分支 1：Transformer Decoder（instance-level）
        if use_transformer_decoder:
            masks_logits = state.get("masks_logits", None)
            object_scores = state.get("object_score", None)
            if (
                masks_logits is not None
                and object_scores is not None
                and masks_logits.shape[0] > 0
            ):
                inst_len = masks_logits.shape[0]
                for inst_id in range(inst_len):
                    inst_logits = masks_logits[inst_id].squeeze()
                    inst_score = float(object_scores[inst_id])
                    if inst_logits.shape != (target_h, target_w):
                        inst_logits = F.interpolate(
                            inst_logits.view(1, 1, *inst_logits.shape),
                            size=(target_h, target_w),
                            mode="bilinear",
                            align_corners=False,
                        ).squeeze()
                    seg_logit = torch.maximum(seg_logit, inst_logits.float() * inst_score)

        # 分支 2：Semantic
        if use_sem_seg:
            sem = state["semantic_mask_logits"].squeeze()
            if sem.shape != (target_h, target_w):
                sem = F.interpolate(
                    state["semantic_mask_logits"].unsqueeze(0)
                    if state["semantic_mask_logits"].dim() == 3
                    else state["semantic_mask_logits"].view(1, 1, *sem.shape),
                    size=(target_h, target_w),
                    mode="bilinear",
                    align_corners=False,
                ).squeeze()
            seg_logit = torch.maximum(seg_logit, sem.float())

        return seg_logit

    def predict_full_image(
        self,
        img_np: np.ndarray,
        invalid_mask: np.ndarray,
        classes: List[str],
        prompts: Dict[str, str],
        crop_size: int = 512,
        stride: int = 384,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        # ====== 策略開關（對齊 SegEarth-OV-3） ======
        use_sem_seg: bool = True,
        use_transformer_decoder: bool = False,
        use_presence_score: bool = True,
        prob_thd: float = 0.0,
        bg_idx: int = 0,
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        滑動窗口推理。預設策略 B（PRISM Dataset Creation）：
            crop_logit = semantic_mask_logits * presence_score
        開啟 use_transformer_decoder=True 切換為策略 A（完整 PRISM）：
            crop_logit = max(masks_logits * object_score, semantic_mask_logits) * presence_score

        Args:
            img_np: HWC uint8 RGB
            invalid_mask: HW bool（True 表示無效像素，最終置為 bg_idx）
            classes: 類別列表，第 0 個必須為背景
            prompts: {class_name: text_prompt} 對映表
            crop_size, stride: 滑窗參數
            use_sem_seg: 啟用語義分支（預設 True）
            use_transformer_decoder: 啟用實例分支融合（預設 False = 策略 B）
            use_presence_score: 啟用 per-crop presence_score 軟調制（預設 True）
            prob_thd: argmax 後 max_logit < prob_thd 的像素回退為 bg_idx（預設 0 = 不過濾）
            bg_idx: 背景索引（預設 0）
        """
        h, w = img_np.shape[:2]
        num_classes = len(classes)

        # 累加器（與 segearthov3_segmentor / create_jiangxi_dataset 一致：
        # 加和後除以 count_mat → 重疊區域取均值）
        all_logits = np.zeros((num_classes, h, w), dtype=np.float32)
        count_mat = np.zeros((1, h, w), dtype=np.float32)
        presence_scores_all: Dict[str, List[float]] = {}

        h_grids = max((h - crop_size + stride - 1) // stride + 1, 1)
        w_grids = max((w - crop_size + stride - 1) // stride + 1, 1)
        total_crops = h_grids * w_grids

        img_pil = Image.fromarray(img_np)

        strategy_name = "A (full PRISM, with TransformerDecoder)" if use_transformer_decoder else "B (PRISM Dataset Creation)"
        print(f"[Predictor] 策略: {strategy_name}")
        print(f"[Predictor] use_sem_seg={use_sem_seg}, use_transformer_decoder={use_transformer_decoder}, use_presence_score={use_presence_score}, prob_thd={prob_thd}")
        print(f"[Predictor] crop_size={crop_size}, stride={stride}, grids={h_grids}x{w_grids}={total_crops}")

        crop_idx = 0
        for h_idx in range(h_grids):
            for w_idx in range(w_grids):
                y1 = min(h_idx * stride, max(h - crop_size, 0))
                x1 = min(w_idx * stride, max(w - crop_size, 0))
                y2 = min(y1 + crop_size, h)
                x2 = min(x1 + crop_size, w)

                crop_img = img_pil.crop((x1, y1, x2, y2))
                crop_h, crop_w = y2 - y1, x2 - x1

                try:
                    with torch.no_grad(), torch.autocast(
                        device_type="cuda", dtype=torch.bfloat16
                    ):
                        state = self.processor.set_image(crop_img)

                        # 對每個前景類別獨立執行 text prompt（與官方一致）
                        for class_idx, class_name in enumerate(classes[1:], 1):
                            if class_name not in prompts:
                                continue

                            prompt = prompts[class_name]
                            self.processor.reset_all_prompts(state)
                            state = self.processor.set_text_prompt(state=state, prompt=prompt)

                            ps = float(state["presence_score"].item())
                            if class_name not in presence_scores_all:
                                presence_scores_all[class_name] = []
                            presence_scores_all[class_name].append(ps)

                            # 計算融合後的 query logit
                            crop_logit = self._compute_query_logit(
                                state=state,
                                target_h=crop_h,
                                target_w=crop_w,
                                use_sem_seg=use_sem_seg,
                                use_transformer_decoder=use_transformer_decoder,
                            )

                            # presence_score 軟調制（PRISM 核心：crop_logit *= ps）
                            if use_presence_score:
                                crop_logit = crop_logit * ps

                            all_logits[class_idx, y1:y2, x1:x2] += crop_logit.cpu().numpy()

                        count_mat[0, y1:y2, x1:x2] += 1

                except Exception as e:
                    import traceback
                    print(f"[Predictor] Crop {crop_idx} 推理失敗: {e}")
                    traceback.print_exc()

                crop_idx += 1

                if progress_callback:
                    progress_callback(
                        crop_idx, total_crops, f"Processing crop {crop_idx}/{total_crops}"
                    )

                torch.cuda.empty_cache()

        # 重疊區域取均值
        count_mat = np.maximum(count_mat, 1)
        all_logits = all_logits / count_mat

        avg_presence = {k: float(np.mean(v)) for k, v in presence_scores_all.items()}

        # 統計打印
        for i, cls in enumerate(classes):
            if i == 0:
                continue
            logits_i = all_logits[i]
            ps_avg = avg_presence.get(cls, 0.0)
            print(
                f"[類別 {i}:{cls}] Logits 範圍: [{logits_i.min():.3f}, {logits_i.max():.3f}], "
                f"均值: {logits_i.mean():.3f}, presence(平均): {ps_avg:.3f}"
            )

        # ===== argmax 預測（嚴格對齊官方 segearthov3_segmentor.predict）=====
        # 官方做法：seg_logits 只包含「前景類」(num_queries)，argmax 只在前景上做，
        # 然後 max_logit < prob_thd 的像素回退為 bg_idx。
        #
        # 我們的 all_logits 形狀是 [num_classes, H, W]，索引 0 是背景（保留為 0），
        # 索引 1..N-1 是前景。我們在前景子集上做 argmax，並用 prob_thd 過濾。
        if num_classes > 1:
            fg_logits = all_logits[1:]  # 只取前景: [num_fg, H, W]
            fg_pred_local = fg_logits.argmax(axis=0)  # 0..num_fg-1
            max_vals = fg_logits.max(axis=0)
            # 偏移為 1..num_fg（與類別表索引對齊）
            prediction = (fg_pred_local + 1).astype(np.uint8)

            # === 關鍵：prob_thd 過濾 ===
            # 沒有這一步，前景 logit > 0 就會贏過背景（永遠初始化為 0），
            # 導致整張圖被誤判為前景類（如 user 報告的「整圖紅色 = building」）
            if prob_thd > 0:
                prediction[max_vals < prob_thd] = bg_idx
                fallback_count = int((max_vals < prob_thd).sum())
                fallback_ratio = fallback_count / max_vals.size * 100
                print(f"[Predictor] prob_thd={prob_thd}: {fallback_count:,} 像素 ({fallback_ratio:.1f}%) 回退為背景")
        else:
            # 退化情況：僅有背景類 → 全部背景
            prediction = np.zeros((h, w), dtype=np.uint8)

        # 無效區域回退為背景
        prediction[invalid_mask] = bg_idx

        # 統計每類像素比例
        for i, cls in enumerate(classes):
            ratio = (prediction == i).sum() / prediction.size * 100
            print(f"[類別 {i}:{cls}] 預測像素比例: {ratio:.2f}%")

        return prediction, avg_presence

    def unload(self):
        """卸載模型釋放 GPU 內存"""
        if self.model is not None:
            del self.model
            del self.processor
            self.model = None
            self.processor = None
            torch.cuda.empty_cache()


_predictor_cache: Dict[str, SAM3Predictor] = {}


def get_predictor(
    bpe_path: str,
    checkpoint_path: str,
    device: str = "cuda",
    confidence_threshold: float = 0.1,
) -> SAM3Predictor:
    """獲取預測器（按 checkpoint_path 緩存不同實例）"""
    global _predictor_cache

    if checkpoint_path not in _predictor_cache:
        _predictor_cache[checkpoint_path] = SAM3Predictor(
            bpe_path=bpe_path,
            checkpoint_path=checkpoint_path,
            device=device,
            confidence_threshold=confidence_threshold,
        )

    return _predictor_cache[checkpoint_path]
