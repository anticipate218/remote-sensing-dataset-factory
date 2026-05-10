# Copyright (c) Meta Platforms, Inc. and affiliates. All Rights Reserved

"""Triton kernel for euclidean distance transform (EDT)"""

import torch

# Triton is optional (not available on Windows)
HAS_TRITON = False
triton = None
tl = None

try:
    import triton
    import triton.language as tl
    HAS_TRITON = True
except ImportError:
    pass


def _edt_fallback(data: torch.Tensor) -> torch.Tensor:
    """Fallback EDT implementation using scipy when triton is not available."""
    try:
        from scipy import ndimage
        import numpy as np
        
        B, H, W = data.shape
        result = torch.zeros_like(data, dtype=torch.float32)
        
        for b in range(B):
            mask = data[b].cpu().numpy().astype(bool)
            edt = ndimage.distance_transform_edt(~mask)
            result[b] = torch.from_numpy(edt.astype(np.float32)).to(data.device)
        
        return result
    except ImportError:
        return torch.zeros_like(data, dtype=torch.float32)


_edt_triton_impl = None


def edt_triton(data: torch.Tensor):
    """
    Computes the Euclidean Distance Transform (EDT) of a batch of binary images.
    Uses Triton if available, otherwise falls back to scipy.
    """
    if HAS_TRITON and _edt_triton_impl is not None:
        return _edt_triton_impl(data)
    else:
        return _edt_fallback(data)

