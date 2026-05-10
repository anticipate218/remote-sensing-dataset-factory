"""
RS Dataset Factory - FastAPI 路由
支持多种遥感图像格式的上传、处理和下载
包含任务持久化存储功能
"""
import os
import sys
import uuid
import json
import shutil
import asyncio
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.responses import Response

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.config import UPLOAD_DIR, OUTPUT_DIR, CLASS_PRESETS
from backend.api.schemas import (
    UploadResponse, TaskCreateRequest, TaskResponse, TaskStatus,
    PresetListResponse, DatasetResult, ProcessingParams, ImageMetadata
)
from backend.utils.geo_utils import create_preview_image, save_preview_image, get_image_metadata
from backend.utils.image_analyzer import analyze_image, analysis_to_dict

router = APIRouter()

# 持久化存储文件路径
TASKS_FILE = Path(OUTPUT_DIR) / "tasks.json"
UPLOADS_FILE = Path(OUTPUT_DIR) / "uploads.json"

# 内存数据库
tasks_db: Dict[str, Dict[str, Any]] = {}
uploaded_files: Dict[str, Dict[str, Any]] = {}
user_models_db: Dict[str, Dict[str, Any]] = {}

# 文件锁，防止并发写入问题
_save_lock = threading.Lock()

# 支持的图像格式
SUPPORTED_IMAGE_FORMATS: List[str] = [
    '.tif', '.tiff',   # GeoTIFF
    '.png',            # PNG
    '.jpg', '.jpeg',   # JPEG
    '.img',            # ERDAS Imagine
    '.hdf', '.hdf4', '.hdf5', '.h5',  # HDF格式
    '.nc', '.nc4',     # NetCDF格式
]


def load_tasks():
    """从JSON文件加载任务数据"""
    global tasks_db
    try:
        if TASKS_FILE.exists():
            with open(TASKS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                tasks_db = data if isinstance(data, dict) else {}
                print(f"[持久化] 已加载 {len(tasks_db)} 个任务")
    except Exception as e:
        print(f"[持久化] 加载任务失败: {e}")
        tasks_db = {}


def save_tasks():
    """保存任务数据到JSON文件"""
    with _save_lock:
        try:
            # 创建可序列化的副本
            serializable_tasks = {}
            for task_id, task in tasks_db.items():
                task_copy = task.copy()
                # 确保status是字符串
                if hasattr(task_copy.get("status"), "value"):
                    task_copy["status"] = task_copy["status"].value
                serializable_tasks[task_id] = task_copy
            
            with open(TASKS_FILE, "w", encoding="utf-8") as f:
                json.dump(serializable_tasks, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            print(f"[持久化] 保存任务失败: {e}")


def load_uploads():
    """从JSON文件加载上传文件信息"""
    global uploaded_files
    try:
        if UPLOADS_FILE.exists():
            with open(UPLOADS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                uploaded_files = data if isinstance(data, dict) else {}
                # 验证文件是否存在
                valid_uploads = {}
                for file_id, info in uploaded_files.items():
                    if os.path.exists(info.get("file_path", "")):
                        valid_uploads[file_id] = info
                uploaded_files = valid_uploads
                print(f"[持久化] 已加载 {len(uploaded_files)} 个上传文件")
    except Exception as e:
        print(f"[持久化] 加载上传文件失败: {e}")
        uploaded_files = {}


def save_uploads():
    """保存上传文件信息到JSON文件"""
    with _save_lock:
        try:
            with open(UPLOADS_FILE, "w", encoding="utf-8") as f:
                json.dump(uploaded_files, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[持久化] 保存上传文件失败: {e}")


# 启动时加载数据
load_tasks()
load_uploads()


@router.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "tasks_count": len(tasks_db),
        "uploads_count": len(uploaded_files)
    }


def is_supported_format(filename: str) -> bool:
    """检查文件是否为支持的格式"""
    ext = os.path.splitext(filename.lower())[1]
    return ext in SUPPORTED_IMAGE_FORMATS


def get_supported_formats_str() -> str:
    """获取支持格式的字符串描述"""
    return ", ".join(SUPPORTED_IMAGE_FORMATS)


@router.post("/upload", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)):
    """
    上传遥感图像
    支持格式: .tif, .tiff, .png, .jpg, .jpeg, .img, .hdf, .nc 等
    """
    if not is_supported_format(file.filename):
        raise HTTPException(
            status_code=400, 
            detail=f"不支持的文件格式。支持的格式: {get_supported_formats_str()}"
        )
    
    file_id = str(uuid.uuid4())[:8]
    file_ext = os.path.splitext(file.filename)[1].lower()
    saved_filename = f"{file_id}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)
    
    # 保存上传的文件
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    try:
        # 创建预览图像
        preview_array, metadata = create_preview_image(file_path, max_preview_size=1024)
        
        preview_filename = f"{file_id}_preview.png"
        preview_path = os.path.join(UPLOAD_DIR, preview_filename)
        save_preview_image(preview_array, preview_path)
        
        # 智能分析图像
        analysis = analyze_image(
            width=metadata["width"],
            height=metadata["height"],
            bands=metadata["bands"],
            file_size=metadata["file_size"]
        )
        analysis_dict = analysis_to_dict(analysis)
        
        uploaded_files[file_id] = {
            "file_id": file_id,
            "filename": file.filename,
            "file_path": file_path,
            "preview_path": preview_path,
            "metadata": metadata,
            "analysis": analysis_dict,
            "uploaded_at": datetime.now().isoformat()
        }
        
        # 持久化保存
        save_uploads()
        
        return UploadResponse(
            task_id=file_id,
            file_id=file_id,
            filename=file.filename,
            file_size=metadata["file_size"],
            width=metadata["width"],
            height=metadata["height"],
            bands=metadata["bands"],
            preview_url=f"/api/preview/{file_id}",
            metadata={**metadata, "analysis": analysis_dict}
        )
        
    except Exception as e:
        # 处理失败时删除上传的文件
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"处理图像失败: {str(e)}")


@router.post("/upload-batch")
async def upload_batch(files: List[UploadFile] = File(...)):
    """批量上传遥感图像（最多50张）"""
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="单次最多上传50个文件")
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="请至少选择一个文件")
    
    results = []
    errors = []
    
    for f in files:
        if not is_supported_format(f.filename):
            errors.append({"filename": f.filename, "error": "不支持的格式"})
            continue
        
        file_id = str(uuid.uuid4())[:8]
        file_ext = os.path.splitext(f.filename)[1].lower()
        saved_filename = f"{file_id}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, saved_filename)
        
        try:
            with open(file_path, "wb") as buffer:
                content = await f.read()
                buffer.write(content)
            
            preview_array, metadata = create_preview_image(file_path, max_preview_size=512)
            preview_filename = f"{file_id}_preview.png"
            preview_path = os.path.join(UPLOAD_DIR, preview_filename)
            save_preview_image(preview_array, preview_path)
            
            uploaded_files[file_id] = {
                "file_id": file_id,
                "filename": f.filename,
                "file_path": file_path,
                "preview_path": preview_path,
                "metadata": metadata,
                "uploaded_at": datetime.now().isoformat()
            }
            
            results.append({
                "file_id": file_id,
                "filename": f.filename,
                "width": metadata.get("width", 0),
                "height": metadata.get("height", 0),
                "preview_url": f"/api/preview/{file_id}",
            })
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            errors.append({"filename": f.filename, "error": str(e)})
    
    save_uploads()
    
    return {
        "message": f"成功上传 {len(results)} 个文件" + (f"，{len(errors)} 个失败" if errors else ""),
        "files": results,
        "errors": errors,
        "total": len(results),
    }


# ============================================================
# 我的上传 — 统一的文件管理 API
# 用于「数据集制作」「下游任务」「模型对比」共享同一份历史文件列表
# ============================================================

@router.get("/uploads")
async def list_uploads(
    limit: int = 100,
    offset: int = 0,
    sort: str = "newest",  # newest | oldest | name
    source: Optional[str] = None,  # 过滤来源: aoi_capture / upload / batch
):
    """列出所有已上传的文件（分页）"""
    items = []
    for fid, info in uploaded_files.items():
        if source and info.get("source") != source:
            continue
        meta = info.get("metadata") or {}
        items.append({
            "file_id": fid,
            "filename": info.get("filename"),
            "uploaded_at": info.get("uploaded_at"),
            "source": info.get("source", "upload"),
            "width": meta.get("width", 0),
            "height": meta.get("height", 0),
            "bands": meta.get("bands", 0),
            "file_size": meta.get("file_size", 0),
            "preview_url": f"/api/preview/{fid}",
            "aoi": info.get("aoi"),  # AOI capture 时记录的地理范围
            "site_name": info.get("site_name"),
        })

    if sort == "newest":
        items.sort(key=lambda x: x["uploaded_at"] or "", reverse=True)
    elif sort == "oldest":
        items.sort(key=lambda x: x["uploaded_at"] or "")
    elif sort == "name":
        items.sort(key=lambda x: (x["filename"] or "").lower())

    total = len(items)
    page = items[offset: offset + limit]
    return {"total": total, "items": page, "limit": limit, "offset": offset}


@router.delete("/uploads/{file_id}")
async def delete_upload(file_id: str):
    """删除一个已上传的文件（含预览图）"""
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    info = uploaded_files.pop(file_id)
    for k in ("file_path", "preview_path"):
        p = info.get(k)
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
    save_uploads()
    return {"ok": True, "file_id": file_id}


# ============================================================
# AOI 捕获 — 从在线瓦片源拼接矩形地理区域为上传图像
# 配合首页地图「画框创建数据集」与「点示范点创建数据集」使用
# ============================================================

@router.post("/aoi/capture")
async def capture_aoi(request: dict, background_tasks: BackgroundTasks):
    """
    根据 bbox + zoom 拼接 XYZ 瓦片，保存为 JPG 上传文件并创建一条 uploaded_files 记录。

    请求示例：
    {
      "north": 39.95, "south": 39.88, "east": 116.45, "west": 116.35,
      "zoom": 14,
      "tile_url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      "site_name": "北京 · CBD"
    }
    """
    import math
    import io
    from PIL import Image as PILImage
    import httpx

    try:
        north = float(request.get("north"))
        south = float(request.get("south"))
        east = float(request.get("east"))
        west = float(request.get("west"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="north/south/east/west 必须是数字")

    if not (south < north and west < east):
        raise HTTPException(status_code=400, detail="bbox 无效：要求 south<north 且 west<east")

    zoom = int(request.get("zoom", 14))
    zoom = max(2, min(18, zoom))
    tile_url = request.get(
        "tile_url",
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    )
    site_name = request.get("site_name") or f"AOI_{datetime.now().strftime('%H%M%S')}"

    # 经纬度 → XYZ 瓦片编号（Web Mercator）
    def latlng_to_tile(lat: float, lng: float, z: int):
        n = 2 ** z
        xt = (lng + 180.0) / 360.0 * n
        lat_r = math.radians(lat)
        yt = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
        return xt, yt

    x0_f, y0_f = latlng_to_tile(north, west, zoom)
    x1_f, y1_f = latlng_to_tile(south, east, zoom)
    x0, x1 = int(math.floor(x0_f)), int(math.ceil(x1_f))
    y0, y1 = int(math.floor(y0_f)), int(math.ceil(y1_f))

    # 限制最大瓦片数（避免一次抓上千张）
    tx_count = x1 - x0
    ty_count = y1 - y0
    total_tiles = max(1, tx_count) * max(1, ty_count)
    MAX_TILES = 64  # 8×8 ≈ 2048×2048 像素，已经够用
    if total_tiles > MAX_TILES:
        # 自动降一个 zoom level 直到瓦片数 ≤ MAX_TILES
        while total_tiles > MAX_TILES and zoom > 2:
            zoom -= 1
            x0_f, y0_f = latlng_to_tile(north, west, zoom)
            x1_f, y1_f = latlng_to_tile(south, east, zoom)
            x0, x1 = int(math.floor(x0_f)), int(math.ceil(x1_f))
            y0, y1 = int(math.floor(y0_f)), int(math.ceil(y1_f))
            tx_count = x1 - x0
            ty_count = y1 - y0
            total_tiles = max(1, tx_count) * max(1, ty_count)

    tile_size = 256
    canvas_w = tx_count * tile_size
    canvas_h = ty_count * tile_size
    canvas = PILImage.new("RGB", (canvas_w, canvas_h), (0, 0, 0))

    fetched, failed = 0, 0
    headers = {"User-Agent": "RS-Dataset-Factory/1.0 (AOI capture)"}
    timeout = httpx.Timeout(connect=8.0, read=15.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        for tx in range(x0, x1):
            for ty in range(y0, y1):
                url = tile_url.format(z=zoom, x=tx, y=ty)
                try:
                    r = await client.get(url)
                    if r.status_code == 200 and r.content:
                        tile_img = PILImage.open(io.BytesIO(r.content)).convert("RGB")
                        canvas.paste(tile_img, ((tx - x0) * tile_size, (ty - y0) * tile_size))
                        fetched += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

    if fetched == 0:
        raise HTTPException(status_code=502, detail="所有瓦片下载失败，请检查网络或 tile_url")

    # 裁剪到精确的 bbox 范围（去掉冗余的瓦片边缘）
    crop_left = int((x0_f - x0) * tile_size)
    crop_top = int((y0_f - y0) * tile_size)
    crop_right = int(canvas_w - (x1 - x1_f) * tile_size)
    crop_bottom = int(canvas_h - (y1 - y1_f) * tile_size)
    crop_left = max(0, crop_left)
    crop_top = max(0, crop_top)
    crop_right = min(canvas_w, max(crop_left + 1, crop_right))
    crop_bottom = min(canvas_h, max(crop_top + 1, crop_bottom))
    canvas = canvas.crop((crop_left, crop_top, crop_right, crop_bottom))

    # 保存为新的 upload 文件
    file_id = str(uuid.uuid4())[:8]
    safe_name = "".join(c for c in site_name if c.isalnum() or c in "-_") or "AOI"
    filename = f"AOI_{safe_name}_z{zoom}_{file_id}.jpg"
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.jpg")
    canvas.save(file_path, "JPEG", quality=92)

    # 创建预览
    preview_array, metadata = create_preview_image(file_path, max_preview_size=1024)
    preview_path = os.path.join(UPLOAD_DIR, f"{file_id}_preview.png")
    save_preview_image(preview_array, preview_path)

    # 智能分析
    analysis = analyze_image(
        width=metadata["width"],
        height=metadata["height"],
        bands=metadata["bands"],
        file_size=metadata["file_size"],
    )
    analysis_dict = analysis_to_dict(analysis)

    aoi_info = {
        "north": north, "south": south, "east": east, "west": west,
        "zoom": zoom, "tile_url": tile_url,
        "tiles_fetched": fetched, "tiles_failed": failed,
    }

    uploaded_files[file_id] = {
        "file_id": file_id,
        "filename": filename,
        "file_path": file_path,
        "preview_path": preview_path,
        "metadata": metadata,
        "analysis": analysis_dict,
        "uploaded_at": datetime.now().isoformat(),
        "source": "aoi_capture",
        "site_name": site_name,
        "aoi": aoi_info,
    }
    save_uploads()

    return {
        "task_id": file_id,
        "file_id": file_id,
        "filename": filename,
        "file_size": metadata["file_size"],
        "width": metadata["width"],
        "height": metadata["height"],
        "bands": metadata["bands"],
        "preview_url": f"/api/preview/{file_id}",
        "aoi": aoi_info,
        "metadata": {**metadata, "analysis": analysis_dict, "aoi": aoi_info},
    }


@router.post("/batch-task")
async def create_batch_task(request: dict, background_tasks: BackgroundTasks):
    """批量创建下游任务（对多个文件执行同一操作）。

    ⚡ **真正的并行执行**：使用 asyncio.create_task + asyncio.to_thread 把多个
    sync runner 同时丢进线程池，而不是 FastAPI BackgroundTasks 的"等 response
    发完再串行执行"。这意味着前端 POST 一返回就能立刻轮询到所有任务都在并行 running。

    并发上限通过环境变量 BATCH_MAX_CONCURRENCY（默认 4）控制，避免 GPU 争抢。
    """
    file_ids = request.get("file_ids", [])
    task_type = request.get("task_type", "")
    params = request.get("params", {})

    if not file_ids:
        raise HTTPException(status_code=400, detail="请提供文件ID列表")
    if len(file_ids) > 50:
        raise HTTPException(status_code=400, detail="单次最多处理50个文件")

    task_runners = {
        "object_detection": ("detect", run_detection),
        "super_resolution": ("sr", run_super_resolution),
        "edge_detection": ("edge", run_edge_detection),
        "dehaze": ("dehaze", run_dehaze),
        "ndvi_analysis": ("ndvi", run_ndvi_analysis),
        "pansharpen": ("pan", run_pansharpen),
    }

    if task_type not in task_runners:
        raise HTTPException(status_code=400, detail=f"不支持的任务类型: {task_type}")

    # 并发上限：默认 4，可通过环境变量调整
    try:
        max_concurrency = int(os.environ.get("BATCH_MAX_CONCURRENCY", "4"))
    except ValueError:
        max_concurrency = 4
    max_concurrency = max(1, min(max_concurrency, 16))

    # 用 semaphore 控制最大并发（避免 16 张图一起挤 GPU）
    semaphore = asyncio.Semaphore(max_concurrency)

    async def _run_one(task_id: str, fid: str):
        """在线程池中跑一个 sync runner，受 semaphore 限流"""
        async with semaphore:
            file_info = uploaded_files.get(fid)
            if file_info is None:
                tasks_db[task_id]["status"] = "failed"
                tasks_db[task_id]["message"] = "文件不存在"
                return
            _, runner = task_runners[task_type]
            try:
                if task_type == "object_detection":
                    await asyncio.to_thread(runner, task_id, file_info, params.get("confidence", 0.25))
                elif task_type == "super_resolution":
                    await asyncio.to_thread(runner, task_id, file_info, params.get("scale", 4))
                elif task_type == "edge_detection":
                    await asyncio.to_thread(
                        runner, task_id, file_info,
                        params.get("low_threshold", 50), params.get("high_threshold", 150),
                    )
                elif task_type == "dehaze":
                    await asyncio.to_thread(runner, task_id, file_info)
                elif task_type == "ndvi_analysis":
                    await asyncio.to_thread(runner, task_id, file_info, params.get("threshold", 0.3))
                elif task_type == "pansharpen":
                    await asyncio.to_thread(runner, task_id, file_info, params.get("boost", 1.0))
            except Exception as e:
                tasks_db[task_id]["status"] = "failed"
                tasks_db[task_id]["message"] = f"任务失败: {e}"
                import traceback
                traceback.print_exc()

    task_ids: list[str] = []
    task_items: list[dict] = []
    missing_file_ids: list[str] = []

    for fid in file_ids:
        if fid not in uploaded_files:
            missing_file_ids.append(fid)
            continue

        task_id = str(uuid.uuid4())[:8]
        tasks_db[task_id] = {
            "task_id": task_id,
            "type": task_type,
            "status": "pending",
            "progress": 0.0,
            "message": f"等待处理: {uploaded_files[fid].get('filename', fid)}",
            "created_at": datetime.now().isoformat(),
            "result": None,
            "source_file": uploaded_files[fid].get("filename", ""),
            "file_id": fid,
        }

        # 立刻 spawn（不等 response 发完），实现真正并行
        asyncio.create_task(_run_one(task_id, fid))

        task_ids.append(task_id)
        task_items.append({"file_id": fid, "task_id": task_id})

    if not task_ids:
        raise HTTPException(status_code=404, detail="未找到可处理的文件ID，请先上传文件")

    save_tasks()

    return {
        "message": (
            f"已创建 {len(task_ids)} 个任务（最大并发 {max_concurrency}）"
            + (f"，{len(missing_file_ids)} 个文件不存在" if missing_file_ids else "")
        ),
        "task_ids": task_ids,
        "task_items": task_items,
        "missing_file_ids": missing_file_ids,
        "task_type": task_type,
        "max_concurrency": max_concurrency,
    }


@router.get("/preview/{file_id}")
async def get_preview(file_id: str):
    """获取预览图像"""
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    preview_path = uploaded_files[file_id]["preview_path"]
    if not os.path.exists(preview_path):
        raise HTTPException(status_code=404, detail="预览图不存在")
    
    return FileResponse(preview_path, media_type="image/png")


@router.get("/presets", response_model=PresetListResponse)
async def get_presets():
    """获取预设类别配置列表"""
    return PresetListResponse(presets=CLASS_PRESETS)


@router.get("/preset/{preset_name}")
async def get_preset(preset_name: str):
    """获取指定预设配置"""
    if preset_name not in CLASS_PRESETS:
        raise HTTPException(status_code=404, detail="预设不存在")
    return CLASS_PRESETS[preset_name]


@router.post("/presets/ai-recommend")
async def ai_recommend_preset(request: dict):
    """
    用 GPT-5.5 Vision 自动识别图像中的地物，生成推荐 PresetConfig。
    
    入参 (任选其一):
      - {"file_id": "<已上传的 file_id>"}                     ← 推荐
      - {"image_path": "<服务器本地路径>"}
      - {"image_b64": "<base64 编码的图像>"}                  ← 兼容前端直传
    
    出参 (PresetConfig 兼容):
      {
        "name": "...", "description": "...", "icon": "🤖",
        "scene_tag": "urban", "tags": ["AI 识别", ...],
        "classes": ["background", ...], "prompts": {...}, "palette": [[r,g,b], ...],
        "reasoning": "...", "detected_scene": "...", "confidence": 0.85,
        "per_class_reasons": [...],
        "model": "gpt-5.5", "usage": {...}
      }
    """
    from backend.services.ai_correction_service import recommend_preset_from_image

    file_id = request.get("file_id")
    image_path = request.get("image_path")
    image_b64 = request.get("image_b64")

    img_path: Optional[str] = None
    cleanup_temp: Optional[str] = None
    try:
        if file_id:
            if file_id not in uploaded_files:
                raise HTTPException(status_code=404, detail=f"file_id 不存在: {file_id}")
            info = uploaded_files[file_id]
            # 优先用预览图（小、快），找不到再用原图
            for k in ("preview_path", "file_path"):
                p = info.get(k)
                if p and os.path.exists(p):
                    img_path = p
                    break
            if not img_path:
                raise HTTPException(status_code=404, detail="找不到该 file_id 对应的图像文件")
        elif image_path:
            if not os.path.exists(image_path):
                raise HTTPException(status_code=404, detail=f"image_path 不存在: {image_path}")
            img_path = image_path
        elif image_b64:
            import base64 as _b64
            tmp_dir = OUTPUT_DIR / "tmp_ai_preset"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            tmp_file = tmp_dir / f"upload_{uuid.uuid4().hex[:8]}.jpg"
            try:
                raw = _b64.b64decode(image_b64.split(",", 1)[-1])
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"image_b64 解码失败: {e}")
            tmp_file.write_bytes(raw)
            img_path = str(tmp_file)
            cleanup_temp = img_path
        else:
            raise HTTPException(status_code=400, detail="必须提供 file_id / image_path / image_b64 之一")

        result = await recommend_preset_from_image(img_path)
        # 附带 file_id 让前端知道是谁的预设
        if file_id:
            result["file_id"] = file_id
        return result

    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI 识图失败: {e}")
    finally:
        if cleanup_temp and os.path.exists(cleanup_temp):
            try:
                os.remove(cleanup_temp)
            except Exception:
                pass


@router.post("/tasks", response_model=TaskResponse)
async def create_task(request: TaskCreateRequest, background_tasks: BackgroundTasks):
    """创建数据集生成任务"""
    file_id = request.file_id
    
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="上传的文件不存在")
    
    task_id = str(uuid.uuid4())[:8]
    
    tasks_db[task_id] = {
        "task_id": task_id,
        "file_id": file_id,
        "config": request.config.model_dump(),
        "status": TaskStatus.PENDING.value,  # 保存为字符串值
        "progress": 0.0,
        "current_step": "queued",
        "message": "任务已创建",
        "created_at": datetime.now().isoformat(),
        "result": None,
        "error": None
    }
    
    # 持久化保存
    save_tasks()
    
    background_tasks.add_task(run_task, task_id)
    
    return TaskResponse(
        task_id=task_id,
        status=TaskStatus.PENDING,
        progress=0.0,
        current_step="queued",
        message="任务已创建并加入队列"
    )


def run_task(task_id: str):
    """后台运行任务（同步函数，由 BackgroundTasks 调用）"""
    import traceback
    from backend.services.dataset_service import get_dataset_service
    
    print(f"[后台任务] 开始执行任务: {task_id}")
    
    task = tasks_db.get(task_id)
    if not task:
        print(f"[后台任务] 任务不存在: {task_id}")
        return
    
    file_info = uploaded_files.get(task["file_id"])
    if not file_info:
        print(f"[后台任务] 源文件不存在: {task['file_id']}")
        tasks_db[task_id]["status"] = TaskStatus.FAILED.value
        tasks_db[task_id]["error"] = "源文件不存在"
        save_tasks()
        return
    
    print(f"[后台任务] 文件路径: {file_info['file_path']}")
    tasks_db[task_id]["status"] = TaskStatus.PROCESSING.value
    tasks_db[task_id]["message"] = "开始处理..."
    save_tasks()
    
    def progress_callback(stage: str, progress: float, message: str):
        print(f"[后台任务] 进度: {stage} - {progress}% - {message}")
        tasks_db[task_id]["current_step"] = stage
        tasks_db[task_id]["progress"] = progress
        tasks_db[task_id]["message"] = message
        save_tasks()
    
    try:
        service = get_dataset_service()
        
        config = task["config"]
        classes = ["background"] + [c["name"] for c in config["classes"]]
        prompts = {c["name"]: c["prompt"] for c in config["classes"]}
        palette = [[0, 0, 0]] + [c["color"] for c in config["classes"]]
        params = config.get("params", {})
        
        print(f"[后台任务] 类别: {classes}")
        print(f"[后台任务] 开始生成数据集...")
        
        result = service.generate_dataset(
            image_path=file_info["file_path"],
            dataset_name=config["name"],
            classes=classes,
            prompts=prompts,
            palette=palette,
            params=params,
            progress_callback=progress_callback
        )
        
        print(f"[后台任务] 数据集生成完成!")
        tasks_db[task_id]["status"] = TaskStatus.COMPLETED.value
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["result"] = result
        tasks_db[task_id]["message"] = "数据集生成完成"
        tasks_db[task_id]["completed_at"] = datetime.now().isoformat()
        save_tasks()
        
    except Exception as e:
        error_msg = str(e)
        trace = traceback.format_exc()
        print(f"[后台任务] 错误: {error_msg}")
        print(f"[后台任务] 堆栈:\n{trace}")
        tasks_db[task_id]["status"] = TaskStatus.FAILED.value
        tasks_db[task_id]["error"] = error_msg
        tasks_db[task_id]["message"] = f"错误: {error_msg}"
        save_tasks()


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """获取任务状态"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    
    # 处理status可能是字符串或枚举的情况
    status_val = task.get("status", "pending")
    if hasattr(status_val, 'value'):
        status_val = status_val.value
    
    return {
        "task_id": task.get("task_id", task_id),
        "status": status_val,
        "progress": task.get("progress", 0),
        "current_step": task.get("current_step", ""),
        "message": task.get("message", ""),
        "result": task.get("result"),
        "error": task.get("error"),
        "type": task.get("type", ""),
    }


@router.get("/tasks")
async def list_tasks(limit: int = Query(default=20, le=100)):
    """列出所有任务"""
    sorted_tasks = sorted(
        tasks_db.values(),
        key=lambda x: x.get("created_at", ""),
        reverse=True
    )[:limit]
    return {"tasks": sorted_tasks}


@router.get("/download/{task_id}")
async def download_dataset(task_id: str):
    """
    下载生成的数据集 ZIP 文件
    添加正确的 CORS 和 Content-Disposition 头以支持前端下载
    """
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在，请确保任务已完成")
    
    task = tasks_db[task_id]
    status = task["status"]
    if isinstance(status, str):
        status_value = status
    else:
        status_value = status.value if hasattr(status, 'value') else str(status)
    
    if status_value != TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="任务尚未完成，无法下载")
    
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="任务结果不存在")
    
    zip_path = result.get("zip_path")
    if not zip_path:
        raise HTTPException(status_code=404, detail="数据集打包路径不存在")
    
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail=f"数据集文件不存在: {os.path.basename(zip_path)}")
    
    # 获取文件名和大小
    filename = os.path.basename(zip_path)
    file_size = os.path.getsize(zip_path)
    
    print(f"[下载] 任务 {task_id} 请求下载: {filename} ({file_size} bytes)")
    
    # 使用流式响应确保大文件也能正确下载
    def iter_file():
        with open(zip_path, "rb") as f:
            while chunk := f.read(8192):
                yield chunk
    
    # 设置响应头
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{filename}',
        "Content-Length": str(file_size),
        "Content-Type": "application/zip",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
        "Cache-Control": "no-cache",
    }
    
    return StreamingResponse(
        iter_file(),
        media_type="application/zip",
        headers=headers
    )


@router.options("/download/{task_id}")
async def download_options(task_id: str):
    """
    处理下载的 CORS 预检请求
    """
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
    }
    return Response(status_code=200, headers=headers)


@router.get("/visualizations/{task_id}")
async def get_visualizations(task_id: str):
    """获取可视化图片列表"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    status = task["status"]
    if isinstance(status, str):
        status_value = status
    else:
        status_value = status.value if hasattr(status, 'value') else str(status)
    
    if status_value != TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="任务尚未完成")
    
    result = task.get("result")
    if not result:
        return {"visualizations": [], "message": "结果数据不存在"}
    
    vis_files = result.get("visualizations", [])
    
    # 验证文件是否存在
    valid_vis_files = []
    for f in vis_files:
        if os.path.exists(f):
            valid_vis_files.append(f)
    
    vis_urls = [f"/api/visualization/{task_id}/{os.path.basename(f)}" for f in valid_vis_files]
    
    print(f"[可视化] 任务 {task_id} 返回 {len(vis_urls)} 张可视化图片")
    
    return {"visualizations": vis_urls, "count": len(vis_urls)}


@router.get("/visualization/{task_id}/{filename}")
async def get_visualization_image(task_id: str, filename: str):
    """获取单个可视化图片"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    status = task["status"]
    if isinstance(status, str):
        status_value = status
    else:
        status_value = status.value if hasattr(status, 'value') else str(status)
    
    if status_value != TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="任务尚未完成")
    
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="任务结果不存在")
    
    output_dir = result.get("output_dir")
    if not output_dir:
        raise HTTPException(status_code=404, detail="输出目录不存在")
    
    safe_name = os.path.basename(filename)
    vis_path = os.path.join(output_dir, "visualizations", safe_name)
    
    if not os.path.exists(vis_path):
        raise HTTPException(status_code=404, detail=f"可视化图片不存在: {safe_name}")
    
    return FileResponse(vis_path, media_type="image/png")


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """删除任务及其文件"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    
    if task.get("result", {}).get("output_dir"):
        output_dir = task["result"]["output_dir"]
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
    
    if task.get("result", {}).get("zip_path"):
        zip_path = task["result"]["zip_path"]
        if os.path.exists(zip_path):
            os.remove(zip_path)
    
    del tasks_db[task_id]
    save_tasks()
    
    return {"message": "任务已删除"}


@router.delete("/files/{file_id}")
async def delete_uploaded_file(file_id: str):
    """删除上传的文件"""
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    file_info = uploaded_files[file_id]
    
    if os.path.exists(file_info["file_path"]):
        os.remove(file_info["file_path"])
    
    if os.path.exists(file_info["preview_path"]):
        os.remove(file_info["preview_path"])
    
    del uploaded_files[file_id]
    save_uploads()
    
    return {"message": "文件已删除"}


@router.post("/reload-data")
async def reload_data():
    """重新加载持久化数据（用于调试）"""
    load_tasks()
    load_uploads()
    return {
        "message": "数据已重新加载",
        "tasks_count": len(tasks_db),
        "uploads_count": len(uploaded_files)
    }


# ============ 单张图片预测和交互式标注 API ============

@router.get("/predict-strategy")
async def get_predict_strategy():
    """获取当前 SegEarth-OV-3 推理策略（用于诊断/调优）"""
    from backend.config import SEGEARTH_STRATEGY
    return {
        "strategy": SEGEARTH_STRATEGY,
        "label": (
            "Strategy A (Full PRISM, with Transformer Decoder)"
            if SEGEARTH_STRATEGY.get("use_transformer_decoder")
            else "Strategy B (PRISM Dataset Creation)"
        ),
        "reference": {
            "strategy_a": "segearthov3_segmentor.py / configs/cfg_loveda.py",
            "strategy_b": "create_jiangxi_dataset.py / prism_advanced_visualizations.py",
        },
    }


@router.post("/predict-strategy")
async def update_predict_strategy(request: dict):
    """运行时切换推理策略（不需要重启）。仅修改进程内的字典副本。"""
    from backend.config import SEGEARTH_STRATEGY
    allowed = {"use_sem_seg", "use_transformer_decoder", "use_presence_score", "prob_thd", "bg_idx"}
    updates = {k: v for k, v in request.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail=f"无有效字段，可选: {sorted(allowed)}")
    SEGEARTH_STRATEGY.update(updates)
    return {"strategy": SEGEARTH_STRATEGY, "applied": updates}


@router.post("/predict-single")
async def predict_single(request: dict, background_tasks: BackgroundTasks):
    """
    单张图片预测，返回预测 mask
    支持可选 model_id 参数使用用户自定义模型
    """
    file_id = request.get("file_id")
    classes = request.get("classes", [])
    model_id = request.get("model_id", "default")
    
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    if not classes:
        raise HTTPException(status_code=400, detail="请至少配置一个类别")
    
    if model_id != "default" and model_id not in user_models_db:
        raise HTTPException(status_code=404, detail=f"模型 {model_id} 不存在")
    
    task_id = str(uuid.uuid4())[:8]
    file_info = uploaded_files[file_id]
    
    custom_checkpoint = None
    if model_id != "default" and model_id in user_models_db:
        custom_checkpoint = user_models_db[model_id]["file_path"]

    tasks_db[task_id] = {
        "task_id": task_id,
        "file_id": file_id,
        "task_type": "single_predict",
        "classes": classes,
        "model_id": model_id,
        "status": TaskStatus.PENDING.value,
        "progress": 0.0,
        "current_step": "queued",
        "message": "预测任务已创建",
        "created_at": datetime.now().isoformat(),
        "result": None,
        "error": None
    }
    save_tasks()

    background_tasks.add_task(run_single_prediction, task_id, file_info, classes, custom_checkpoint)
    
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "预测任务已开始"
    }


def run_single_prediction(task_id: str, file_info: dict, classes: list, custom_checkpoint: Optional[str] = None):
    """运行单张图片预测（同步函数），支持自定义 checkpoint"""
    import traceback
    from backend.services.dataset_service import get_dataset_service
    from PIL import Image
    import numpy as np
    
    print(f"[单张预测] 开始任务: {task_id}" + (f" (自定义模型: {custom_checkpoint})" if custom_checkpoint else ""))
    
    tasks_db[task_id]["status"] = TaskStatus.PROCESSING.value
    tasks_db[task_id]["message"] = "正在加载模型..."
    save_tasks()
    
    try:
        service = get_dataset_service()
        
        # 构建类别和提示
        class_names = ["background"] + [c["name"] for c in classes]
        prompts = {c["name"]: c["prompt"] for c in classes}
        palette = [[0, 0, 0]] + [c["color"] for c in classes]
        
        print(f"[单张预测] 类别: {class_names}")
        
        tasks_db[task_id]["progress"] = 10.0
        tasks_db[task_id]["message"] = "正在加载图像..."
        save_tasks()
        
        # 加载图像
        from backend.utils.geo_utils import load_image_auto
        image_rgb, scale, invalid_mask, (new_w, new_h), _ = load_image_auto(
            file_info["file_path"],
            max_size=2048
        )
        
        print(f"[单张预测] 图像尺寸: {new_w}x{new_h}, 缩放比例: {scale}")
        
        tasks_db[task_id]["progress"] = 30.0
        tasks_db[task_id]["message"] = "正在运行模型预测..."
        save_tasks()
        
        # 运行预测
        # 小图（<=1024）优先整图推理，避免滑窗带来的额外开销
        if max(new_w, new_h) <= 1024:
            crop_size = min(new_w, new_h)
            stride = crop_size  # 无重叠，等价整图一次推理
            print(f"[单张预测] 小图整图推理模式: crop_size={crop_size}, stride={stride}")
        else:
            # 大图默认滑窗推理，兼顾显存与边缘质量
            crop_size = 512
            stride = 384  # 重叠 128 像素，提高边缘质量
        
        print(f"[单张预测] 开始模型推理... crop_size={crop_size}, stride={stride}")
        if custom_checkpoint:
            from backend.config import MODEL_CONFIG
            from backend.core.predictor import get_predictor
            predictor = get_predictor(
                bpe_path=MODEL_CONFIG["bpe_path"],
                checkpoint_path=custom_checkpoint,
                device=MODEL_CONFIG["device"],
                confidence_threshold=MODEL_CONFIG["confidence_threshold"],
            )
        else:
            service._ensure_predictor()
            predictor = service.predictor
        from backend.config import SEGEARTH_STRATEGY
        prediction, presence_scores = predictor.predict_full_image(
            img_np=image_rgb,
            invalid_mask=invalid_mask,
            classes=class_names,
            prompts=prompts,
            crop_size=crop_size,
            stride=stride,
            use_sem_seg=SEGEARTH_STRATEGY["use_sem_seg"],
            use_transformer_decoder=SEGEARTH_STRATEGY["use_transformer_decoder"],
            use_presence_score=SEGEARTH_STRATEGY["use_presence_score"],
            prob_thd=SEGEARTH_STRATEGY["prob_thd"],
            bg_idx=SEGEARTH_STRATEGY["bg_idx"],
        )
        
        print(f"[单张预测] 预测完成, 结果形状: {prediction.shape}")
        
        tasks_db[task_id]["progress"] = 80.0
        tasks_db[task_id]["message"] = "正在生成结果..."
        save_tasks()
        
        # 保存预测 mask（灰度图，像素值=类别索引）
        mask_dir = os.path.join(OUTPUT_DIR, f"prediction_{task_id}")
        os.makedirs(mask_dir, exist_ok=True)
        
        mask_path = os.path.join(mask_dir, "mask.png")
        mask_img = Image.fromarray(prediction.astype(np.uint8), mode='L')
        mask_img.save(mask_path)
        
        # 保存彩色预览
        color_mask = np.zeros((*prediction.shape, 3), dtype=np.uint8)
        for i, color in enumerate(palette):
            color_mask[prediction == i] = color
        
        color_mask_path = os.path.join(mask_dir, "mask_color.png")
        Image.fromarray(color_mask).save(color_mask_path)
        
        # 保存原图预览
        original_path = os.path.join(mask_dir, "original.png")
        rgb_norm = ((image_rgb - image_rgb.min()) / (image_rgb.max() - image_rgb.min() + 1e-8) * 255).astype(np.uint8)
        Image.fromarray(rgb_norm).save(original_path)
        
        tasks_db[task_id]["status"] = TaskStatus.COMPLETED.value
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = "预测完成"
        tasks_db[task_id]["result"] = {
            "mask_path": mask_path,
            "color_mask_path": color_mask_path,
            "original_path": original_path,
            "output_dir": mask_dir,
            "image_size": [new_w, new_h],
            "scale": scale,
            "num_classes": len(class_names),
            "classes": class_names,
            "palette": palette,
            "presence_scores": presence_scores,
        }
        save_tasks()
        
        print(f"[单张预测] 任务完成: {task_id}")
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        trace = traceback.format_exc()
        print(f"[单张预测] 错误: {error_msg}")
        print(f"[单张预测] 堆栈:\n{trace}")
        tasks_db[task_id]["status"] = TaskStatus.FAILED.value
        tasks_db[task_id]["error"] = error_msg
        tasks_db[task_id]["message"] = f"预测失败: {error_msg}"
        save_tasks()


@router.get("/prediction/{task_id}/mask")
async def get_prediction_mask(task_id: str, colored: bool = False):
    """获取预测的 mask 图像"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    if task.get("status") != TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="预测尚未完成")
    
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="预测结果不存在")
    
    if colored:
        mask_path = result.get("color_mask_path")
    else:
        mask_path = result.get("mask_path")
    
    if not mask_path or not os.path.exists(mask_path):
        raise HTTPException(status_code=404, detail="Mask 文件不存在")
    
    return FileResponse(mask_path, media_type="image/png")


@router.get("/prediction/{task_id}/original")
async def get_prediction_original(task_id: str):
    """获取预测任务的原图"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="结果不存在")
    
    original_path = result.get("original_path")
    if not original_path or not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="原图不存在")
    
    return FileResponse(original_path, media_type="image/png")


@router.post("/annotation/{task_id}/save")
async def save_annotation(
    task_id: str,
    mask: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
):
    """
    保存用户编辑后的标注 mask。
    兼容两种 form-data 字段名：mask（前端默认）/ file（旧版）。
    """
    upload = mask or file
    if upload is None:
        raise HTTPException(status_code=422, detail="缺少 mask / file 字段")

    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")

    task = tasks_db[task_id]
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="预测结果不存在")

    output_dir = result.get("output_dir")
    if not output_dir:
        raise HTTPException(status_code=404, detail="输出目录不存在")

    # 保存编辑后的 mask
    edited_mask_path = os.path.join(output_dir, "mask_edited.png")

    content = await upload.read()
    with open(edited_mask_path, "wb") as f:
        f.write(content)
    
    # 更新任务结果
    tasks_db[task_id]["result"]["edited_mask_path"] = edited_mask_path
    tasks_db[task_id]["result"]["edited_at"] = datetime.now().isoformat()
    save_tasks()
    
    return {
        "message": "标注已保存",
        "edited_mask_path": edited_mask_path
    }


# ============================================================
# 类别精修 API（使用专用模型对单一类别进行二次分割）
# ============================================================
@router.get("/refiners")
async def list_class_refiners():
    """获取所有可用的类别精修器"""
    from backend.services.refine_service import list_refiners
    return {"refiners": list_refiners()}


@router.post("/refine-class/{task_id}")
async def refine_class_endpoint(task_id: str, request: dict, background_tasks: BackgroundTasks):
    """
    对预测结果中的指定类别进行精修。

    Body:
      - class_name: 类别名（用于显示，必填）
      - class_index: 类别在 mask 中的灰度索引（必填，>=1）
      - refiner_id: 精修器 ID（如 'building'，必填）
    """
    from backend.services.refine_service import get_refiner

    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks_db[task_id]
    if task.get("status") != TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="任务尚未完成预测，无法精修")
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="预测结果不存在")

    class_name = request.get("class_name")
    class_index = request.get("class_index")
    refiner_id = request.get("refiner_id")

    if not class_name or class_index is None or not refiner_id:
        raise HTTPException(status_code=400, detail="缺少必填参数 class_name / class_index / refiner_id")

    try:
        from backend.services.refine_service import resolve_refiner_id
        refiner_id = resolve_refiner_id(refiner_id)  # 解析别名 / category → 真实 ID
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if class_index < 1:
        raise HTTPException(status_code=400, detail="class_index 必须 >= 1（0 为背景）")

    # 创建精修子任务
    refine_task_id = f"refine_{task_id}_{uuid.uuid4().hex[:6]}"
    tasks_db[refine_task_id] = {
        "task_id": refine_task_id,
        "task_type": "class_refine",
        "parent_task_id": task_id,
        "status": TaskStatus.PENDING.value,
        "progress": 0.0,
        "current_step": "queued",
        "message": f"准备精修 {class_name}",
        "created_at": datetime.now().isoformat(),
        "refine_info": {
            "class_name": class_name,
            "class_index": class_index,
            "refiner_id": refiner_id,
        },
        "result": None,
        "error": None,
    }
    save_tasks()

    background_tasks.add_task(
        run_class_refinement,
        refine_task_id,
        task_id,
        class_name,
        int(class_index),
        refiner_id,
    )

    return {
        "refine_task_id": refine_task_id,
        "parent_task_id": task_id,
        "status": "pending",
        "message": f"{class_name} 精修任务已开始",
    }


@router.post("/refine-review/{task_id}")
async def review_refinement_endpoint(task_id: str, request: dict):
    """
    使用 GPT 视觉模型对刚刚完成的精修做 BEFORE vs AFTER 复查。
    Body:
      - refine_task_id: 要复查的精修子任务 ID（默认取最近一次未撤销的）
    """
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    parent = tasks_db[task_id]
    result = parent.get("result") or {}
    history = result.get("refine_history") or []
    if not history:
        raise HTTPException(status_code=400, detail="该任务没有精修历史")

    target_id = request.get("refine_task_id")
    target = None
    if target_id:
        target = next((h for h in history if h.get("refine_task_id") == target_id), None)
    else:
        # 取最近一次有 pre/post 快照且未撤销的
        for h in reversed(history):
            if h.get("pre_snapshot_path") and h.get("post_snapshot_path") and not h.get("reverted"):
                target = h
                break
    if not target:
        raise HTTPException(status_code=404, detail="未找到可复查的精修记录")

    pre_path = target.get("pre_snapshot_path")
    post_path = target.get("post_snapshot_path")
    if not pre_path or not post_path or not os.path.exists(pre_path) or not os.path.exists(post_path):
        raise HTTPException(status_code=404, detail="精修快照文件丢失")

    # 找原图路径
    file_id = parent.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="原图文件丢失")
    file_info = uploaded_files[file_id]
    original_path = file_info.get("file_path")

    # 找类别颜色
    class_name = target.get("class_name")
    class_index = target.get("class_index")
    palette = result.get("palette") or []
    target_color = palette[class_index] if 0 <= class_index < len(palette) else [255, 0, 0]

    try:
        from backend.services.ai_correction_service import review_refinement
        review = await review_refinement(
            original_path=original_path,
            pre_mask_path=pre_path,
            post_mask_path=post_path,
            target_class_idx=int(class_index),
            target_class_name=class_name,
            target_color=target_color,
        )
        return {
            "task_id": task_id,
            "refine_task_id": target.get("refine_task_id"),
            "class_name": class_name,
            "review": review,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GPT 复查失败: {e}")


@router.get("/refine-history/{task_id}")
async def get_refine_history(task_id: str):
    """
    获取该任务的精修历史（用于撤销/对比）。
    
    回传字段:
      - history: 该任务的所有精修记录
      - can_undo_refine: 是否有可撤销的精修
      - parent_task_id: 父任务 ID（如果是 ai-rerun 创建的，可切回父任务作为另一种"撤销"）
      - can_undo_rerun: 是否可以切回父任务（即 parent_task_id 存在且仍可访问）
      - can_undo: any of above（前端按钮显示用）
    """
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks_db[task_id]
    result = task.get("result") or {}
    history = result.get("refine_history") or []
    can_undo_refine = any(not h.get("reverted", False) for h in history)
    parent_task_id = task.get("parent_task_id")
    can_undo_rerun = bool(parent_task_id and parent_task_id in tasks_db)
    return {
        "task_id": task_id,
        "history": history,
        "can_undo_refine": can_undo_refine,
        "parent_task_id": parent_task_id,
        "can_undo_rerun": can_undo_rerun,
        # 兼容旧字段：only true if at least one of the two undo paths is available
        "can_undo": can_undo_refine or can_undo_rerun,
    }


@router.post("/refine-revert/{task_id}")
async def revert_refinement(task_id: str, request: dict = None):
    """
    撤销最近一次精修，把 mask 恢复到精修前的快照。
    Body（可选）:
      - refine_task_id: 指定撤销某次（默认撤销最近一次未撤销的）
    """
    import numpy as np
    from PIL import Image
    from shutil import copyfile

    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks_db[task_id]
    result = task.get("result") or {}
    history = result.get("refine_history") or []

    if not history:
        raise HTTPException(status_code=400, detail="该任务没有任何精修历史")

    target = None
    target_idx = -1
    target_refine_id = (request or {}).get("refine_task_id") if request else None

    if target_refine_id:
        for i, h in enumerate(history):
            if h.get("refine_task_id") == target_refine_id and not h.get("reverted"):
                target, target_idx = h, i
                break
        if target is None:
            raise HTTPException(status_code=404, detail=f"未找到可撤销的精修记录 {target_refine_id}")
    else:
        # 默认：从后往前找第一个未撤销的
        for i in range(len(history) - 1, -1, -1):
            if not history[i].get("reverted", False):
                target, target_idx = history[i], i
                break
        if target is None:
            raise HTTPException(status_code=400, detail="所有精修记录均已撤销")

    pre_path = target.get("pre_snapshot_path")
    if not pre_path or not os.path.exists(pre_path):
        raise HTTPException(status_code=500, detail="精修前快照丢失，无法撤销")

    mask_path = result.get("mask_path")
    if not mask_path:
        raise HTTPException(status_code=500, detail="主 mask 路径丢失")

    # 恢复灰度 mask
    pre_mask = np.array(Image.open(pre_path).convert("L"))
    Image.fromarray(pre_mask.astype(np.uint8), mode="L").save(mask_path)

    # 恢复彩色 mask（优先用快照，否则用 palette 重新着色）
    color_mask_path = result.get("color_mask_path")
    pre_color_path = target.get("pre_color_path")
    if color_mask_path:
        if pre_color_path and os.path.exists(pre_color_path):
            try:
                copyfile(pre_color_path, color_mask_path)
            except Exception as e:
                print(f"[Revert] 复制彩色快照失败，重新着色: {e}")
                pre_color_path = None
        if not pre_color_path or not os.path.exists(pre_color_path):
            palette = result.get("palette") or []
            if palette:
                color_mask = np.zeros((*pre_mask.shape, 3), dtype=np.uint8)
                for i, color in enumerate(palette):
                    color_mask[pre_mask == i] = color
                Image.fromarray(color_mask).save(color_mask_path)

    # 标记历史为已撤销
    history[target_idx]["reverted"] = True
    history[target_idx]["reverted_at"] = datetime.now().isoformat()
    tasks_db[task_id]["result"]["refine_history"] = history
    save_tasks()

    return {
        "message": f"已撤销 {target.get('class_name')} 的精修（{target.get('refiner_id')}）",
        "refine_task_id": target.get("refine_task_id"),
        "class_name": target.get("class_name"),
        "remaining_undo": sum(1 for h in history if not h.get("reverted", False)),
    }


def run_class_refinement(
    refine_task_id: str,
    parent_task_id: str,
    class_name: str,
    class_index: int,
    refiner_id: str,
):
    """同步执行类别精修任务"""
    import traceback
    import numpy as np
    from PIL import Image

    print(f"[Refine] 启动精修任务 {refine_task_id} -> 父任务 {parent_task_id}")
    print(f"[Refine] 类别={class_name}(idx={class_index}), 精修器={refiner_id}")

    tasks_db[refine_task_id]["status"] = TaskStatus.PROCESSING.value
    tasks_db[refine_task_id]["progress"] = 5.0
    tasks_db[refine_task_id]["message"] = "正在加载图像与原 mask..."
    save_tasks()

    try:
        parent = tasks_db.get(parent_task_id)
        if not parent or not parent.get("result"):
            raise RuntimeError("父任务结果丢失")
        result = parent["result"]
        file_id = parent.get("file_id")
        if not file_id or file_id not in uploaded_files:
            raise RuntimeError("原始上传文件丢失")
        file_info = uploaded_files[file_id]

        # 加载原图（与 predict-single 一致的预处理）
        from backend.utils.geo_utils import load_image_auto
        image_rgb, scale, invalid_mask, (new_w, new_h), _ = load_image_auto(
            file_info["file_path"], max_size=2048
        )

        # 加载已有 mask
        mask_path = result.get("mask_path")
        if not mask_path or not os.path.exists(mask_path):
            raise RuntimeError("原 mask 文件不存在")
        original_mask = np.array(Image.open(mask_path).convert("L"))
        if original_mask.shape[:2] != (new_h, new_w):
            # 防御性 resize
            original_mask = np.array(
                Image.fromarray(original_mask).resize(
                    (new_w, new_h), Image.NEAREST
                )
            )

        # === Stage 1: 写入精修前快照（用于撤销）===
        refine_dir = os.path.join(os.path.dirname(mask_path), "refines")
        os.makedirs(refine_dir, exist_ok=True)
        pre_snapshot_path = os.path.join(
            refine_dir, f"{refine_task_id}_pre_{class_name}.png"
        )
        Image.fromarray(original_mask.astype(np.uint8), mode="L").save(pre_snapshot_path)

        color_mask_path_existing = result.get("color_mask_path")
        pre_color_path = None
        if color_mask_path_existing and os.path.exists(color_mask_path_existing):
            pre_color_path = os.path.join(
                refine_dir, f"{refine_task_id}_pre_{class_name}_color.png"
            )
            try:
                from shutil import copyfile
                copyfile(color_mask_path_existing, pre_color_path)
            except Exception as _e:
                print(f"[Refine] 复制彩色 mask 失败（忽略）: {_e}")
                pre_color_path = None

        tasks_db[refine_task_id]["progress"] = 25.0
        tasks_db[refine_task_id]["message"] = "正在运行专用模型推理..."
        save_tasks()

        from backend.services.refine_service import refine_class

        def _progress(done: int, total: int, message: str):
            pct = 25.0 + 60.0 * (done / max(total, 1))
            tasks_db[refine_task_id]["progress"] = round(pct, 1)
            tasks_db[refine_task_id]["message"] = message
            save_tasks()

        # 收集类别上下文（提示词等）传给 GPT 精修器
        parent_classes = parent.get("classes") or []
        class_context = {}
        if isinstance(parent_classes, list):
            for c in parent_classes:
                if isinstance(c, dict) and c.get("name") == class_name:
                    class_context = {
                        "current_prompt": c.get("prompt", ""),
                        "color": c.get("color", []),
                    }
                    break

        new_mask, info = refine_class(
            image_rgb=image_rgb,
            invalid_mask=invalid_mask,
            original_mask=original_mask,
            target_class_idx=class_index,
            refiner_id=refiner_id,
            progress_callback=_progress,
            target_class_name=class_name,
            extra_context=class_context,
        )

        # === 安全闸：如果精修被拒绝，不要写入 mask，直接结束并提示 ===
        if info.get("rejected"):
            reason = info.get("reject_reason", "精修结果异常")
            print(f"[Refine] 任务 {refine_task_id} 被拒绝应用: {reason}")
            tasks_db[refine_task_id]["status"] = TaskStatus.COMPLETED.value
            tasks_db[refine_task_id]["progress"] = 100.0
            tasks_db[refine_task_id]["message"] = f"⚠️ 精修被拒绝: {reason}"
            tasks_db[refine_task_id]["result"] = {
                "stats": info,
                "rejected": True,
            }
            save_tasks()
            # 删除 pre_snapshot 因为没改 mask，保留 history 中的拒绝记录
            history = parent.get("result", {}).get("refine_history", [])
            history.append({
                "refine_task_id": refine_task_id,
                "class_name": class_name,
                "class_index": class_index,
                "refiner_id": refiner_id,
                "stats": {k: v for k, v in info.items() if k != "presence_scores"},
                "at": datetime.now().isoformat(),
                "pre_snapshot_path": None,
                "pre_color_path": None,
                "post_snapshot_path": None,
                "reverted": True,
                "rejected": True,
                "reject_reason": reason,
            })
            tasks_db[parent_task_id]["result"]["refine_history"] = history
            save_tasks()
            return

        tasks_db[refine_task_id]["progress"] = 90.0
        tasks_db[refine_task_id]["message"] = "正在写出精修后的 mask..."
        save_tasks()

        # 覆盖原 mask 文件
        Image.fromarray(new_mask.astype(np.uint8), mode="L").save(mask_path)

        # 重新生成彩色 mask
        palette = result.get("palette") or []
        if palette:
            color_mask = np.zeros((*new_mask.shape, 3), dtype=np.uint8)
            for i, color in enumerate(palette):
                color_mask[new_mask == i] = color
            color_mask_path = result.get("color_mask_path")
            if color_mask_path:
                Image.fromarray(color_mask).save(color_mask_path)

        # 写一份精修后的备份，便于回溯
        refine_dir = os.path.join(os.path.dirname(mask_path), "refines")
        os.makedirs(refine_dir, exist_ok=True)
        snapshot_path = os.path.join(
            refine_dir, f"{refine_task_id}_{class_name}.png"
        )
        Image.fromarray(new_mask.astype(np.uint8), mode="L").save(snapshot_path)

        tasks_db[refine_task_id]["status"] = TaskStatus.COMPLETED.value
        tasks_db[refine_task_id]["progress"] = 100.0
        tasks_db[refine_task_id]["message"] = (
            f"{info['refiner_name']} 完成：新增 {info['added_pixels']:,} 像素 / 移除 {info['removed_pixels']:,} 像素"
        )
        tasks_db[refine_task_id]["result"] = {
            "snapshot_path": snapshot_path,
            "stats": info,
        }
        save_tasks()

        # 父任务也记录一次精修历史（含撤销快照路径）
        history = parent.get("result", {}).get("refine_history", [])
        history.append(
            {
                "refine_task_id": refine_task_id,
                "class_name": class_name,
                "class_index": class_index,
                "refiner_id": refiner_id,
                "stats": {
                    k: v for k, v in info.items() if k != "presence_scores"
                },
                "at": datetime.now().isoformat(),
                "pre_snapshot_path": pre_snapshot_path,
                "pre_color_path": pre_color_path,
                "post_snapshot_path": snapshot_path,
                "reverted": False,
            }
        )
        tasks_db[parent_task_id]["result"]["refine_history"] = history
        tasks_db[parent_task_id]["result"]["last_refined_at"] = datetime.now().isoformat()
        save_tasks()

        print(f"[Refine] 任务 {refine_task_id} 完成: {tasks_db[refine_task_id]['message']}")

    except Exception as e:
        trace = traceback.format_exc()
        print(f"[Refine] 错误: {e}\n{trace}")
        tasks_db[refine_task_id]["status"] = TaskStatus.FAILED.value
        tasks_db[refine_task_id]["error"] = str(e)
        tasks_db[refine_task_id]["message"] = f"精修失败: {e}"
        save_tasks()


@router.post("/generate-from-annotation/{task_id}")
async def generate_from_annotation(task_id: str, request: dict):
    """
    基于编辑后的标注生成最终数据集
    """
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="预测结果不存在")
    
    # 获取 mask 路径（优先使用编辑后的）
    mask_path = result.get("edited_mask_path") or result.get("mask_path")
    if not mask_path or not os.path.exists(mask_path):
        raise HTTPException(status_code=404, detail="Mask 文件不存在")
    
    original_path = result.get("original_path")
    if not original_path or not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail="原图不存在")
    
    dataset_name = request.get("dataset_name", f"Dataset_{task_id}")
    include_original = request.get("include_original", True)
    include_color_mask = request.get("include_color_mask", True)
    export_mode = request.get("export_mode", "whole")  # whole / sliced / both
    classes = result.get("classes") or []
    palette = result.get("palette") or []
    
    import shutil
    from PIL import Image
    import numpy as np
    
    output_dir = os.path.join(OUTPUT_DIR, dataset_name)
    os.makedirs(output_dir, exist_ok=True)
    
    # --- whole: 整张大图标注 ---
    if export_mode in ("whole", "both"):
        os.makedirs(os.path.join(output_dir, "labels"), exist_ok=True)
        shutil.copy(mask_path, os.path.join(output_dir, "labels", "label.png"))
        
        if include_original:
            os.makedirs(os.path.join(output_dir, "images"), exist_ok=True)
            shutil.copy(original_path, os.path.join(output_dir, "images", "image.png"))
        
        if include_color_mask and len(palette) > 0:
            try:
                os.makedirs(os.path.join(output_dir, "labels_color"), exist_ok=True)
                mask_img = Image.open(mask_path).convert('L')
                mask_array = np.array(mask_img)
                color_mask = np.zeros((*mask_array.shape[:2], 3), dtype=np.uint8)
                for i, color in enumerate(palette):
                    if isinstance(color, (list, tuple)) and len(color) >= 3:
                        color_mask[mask_array == i] = color[:3]
                Image.fromarray(color_mask).save(os.path.join(output_dir, "labels_color", "label_color.png"))
            except Exception as e:
                print(f"[导出] 彩色标签生成警告: {e}")
    
    # --- sliced: 切分为 train/val/test 数据集 ---
    if export_mode in ("sliced", "both"):
        sliced_dir = os.path.join(output_dir, "sliced_dataset")
        os.makedirs(sliced_dir, exist_ok=True)
        try:
            orig_img = Image.open(original_path).convert("RGB")
            mask_img = Image.open(mask_path).convert("L")
            orig_np = np.array(orig_img)
            mask_np = np.array(mask_img)
            h, w = mask_np.shape[:2]
            crop_size = 512
            stride = 384
            overlap = crop_size - stride
            
            for split, ratio_start, ratio_end in [("train", 0.0, 0.7), ("val", 0.7, 0.85), ("test", 0.85, 1.0)]:
                os.makedirs(os.path.join(sliced_dir, split, "images"), exist_ok=True)
                os.makedirs(os.path.join(sliced_dir, split, "labels"), exist_ok=True)
            
            tiles = []
            for y in range(0, max(h - crop_size + 1, 1), stride):
                for x in range(0, max(w - crop_size + 1, 1), stride):
                    y2 = min(y + crop_size, h)
                    x2 = min(x + crop_size, w)
                    y1 = max(y2 - crop_size, 0)
                    x1 = max(x2 - crop_size, 0)
                    tiles.append((x1, y1, x2, y2))
            
            if not tiles:
                tiles = [(0, 0, w, h)]
            
            import random
            random.shuffle(tiles)
            n = len(tiles)
            train_end = int(n * 0.7)
            val_end = int(n * 0.85)
            
            for idx, (x1, y1, x2, y2) in enumerate(tiles):
                if idx < train_end:
                    split = "train"
                elif idx < val_end:
                    split = "val"
                else:
                    split = "test"
                
                tile_img = orig_np[y1:y2, x1:x2]
                tile_mask = mask_np[y1:y2, x1:x2]
                fname = f"{idx:04d}_{x1}_{y1}.png"
                Image.fromarray(tile_img).save(os.path.join(sliced_dir, split, "images", fname))
                Image.fromarray(tile_mask).save(os.path.join(sliced_dir, split, "labels", fname))
            
            sliced_info = {
                "crop_size": crop_size, "stride": stride,
                "total_tiles": n,
                "train": train_end, "val": val_end - train_end, "test": n - val_end,
            }
            with open(os.path.join(sliced_dir, "split_info.json"), "w", encoding="utf-8") as f:
                json.dump(sliced_info, f, ensure_ascii=False, indent=2)
            print(f"[导出] 切分完成: {n} tiles (train={train_end}, val={val_end-train_end}, test={n-val_end})")
        except Exception as e:
            print(f"[导出] 切分数据集警告: {e}")
    
    # 生成数据集信息
    dataset_info = {
        "name": dataset_name,
        "type": export_mode,
        "classes": classes,
        "palette": palette,
        "num_samples": 1,
        "image_size": result.get("image_size", []),
        "created_at": datetime.now().isoformat()
    }
    
    with open(os.path.join(output_dir, "dataset_info.json"), "w", encoding="utf-8") as f:
        json.dump(dataset_info, f, ensure_ascii=False, indent=2)
    
    zip_base = os.path.basename(output_dir)
    zip_root = os.path.dirname(output_dir)
    zip_path = f"{output_dir}.zip"
    shutil.make_archive(output_dir, 'zip', root_dir=zip_root, base_dir=zip_base)
    
    # 更新任务结果
    tasks_db[task_id]["result"]["final_output_dir"] = output_dir
    tasks_db[task_id]["result"]["final_zip_path"] = zip_path
    tasks_db[task_id]["result"]["dataset_name"] = dataset_name
    save_tasks()
    
    return {
        "message": "数据集生成完成",
        "dataset_name": dataset_name,
        "output_dir": output_dir,
        "zip_path": zip_path,
        "download_url": f"/api/download-annotation/{task_id}"
    }


@router.get("/download-annotation/{task_id}")
async def download_annotation_dataset(task_id: str):
    """下载基于标注生成的数据集"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = tasks_db[task_id]
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="结果不存在")
    
    zip_path = result.get("final_zip_path")
    if not zip_path or not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="数据集文件不存在")
    
    filename = os.path.basename(zip_path)
    return FileResponse(
        zip_path, 
        media_type="application/zip",
        filename=filename,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


# ============================================================
# 数据预处理 API
# ============================================================

def _do_preprocess_enhance(file_path: str, file_id: str, method: str, params: dict) -> dict:
    """同步执行的图像增强逻辑（被 asyncio.to_thread 调用，不阻塞 event loop）"""
    from PIL import Image, ImageEnhance, ImageFilter
    import numpy as np

    img = Image.open(file_path).convert("RGB")

    if method == "histogram":
        img_array = np.array(img)
        for c in range(3):
            hist, bins = np.histogram(img_array[:, :, c].flatten(), 256, [0, 256])
            cdf = hist.cumsum()
            cdf_m = np.ma.masked_equal(cdf, 0)
            cdf_m = (cdf_m - cdf_m.min()) * 255 / (cdf_m.max() - cdf_m.min())
            cdf = np.ma.filled(cdf_m, 0).astype('uint8')
            img_array[:, :, c] = cdf[img_array[:, :, c]]
        img = Image.fromarray(img_array)

    elif method == "contrast":
        factor = params.get("factor", 1.5)
        img = ImageEnhance.Contrast(img).enhance(factor)

    elif method == "brightness":
        factor = params.get("factor", 1.2)
        img = ImageEnhance.Brightness(img).enhance(factor)

    elif method == "denoise":
        kernel_size = params.get("kernel_size", 3)
        img = img.filter(ImageFilter.MedianFilter(size=kernel_size))

    elif method == "sharpen":
        factor = params.get("factor", 2.0)
        img = ImageEnhance.Sharpness(img).enhance(factor)

    else:
        raise ValueError(f"不支持的增强方法: {method}")

    output_filename = f"{file_id}_enhanced_{method}.png"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    img.save(output_path)

    preview_path = os.path.join(OUTPUT_DIR, f"{file_id}_enhanced_{method}_preview.png")
    preview = img.copy()
    preview.thumbnail((512, 512))
    preview.save(preview_path)

    return {
        "message": f"图像增强完成 ({method})",
        "output_path": output_path,
        "preview_url": f"/preprocess/preview/{output_filename}",
        "download_url": f"/preprocess/download/{output_filename}",
        "method": method,
    }


@router.post("/preprocess/enhance")
async def preprocess_enhance(request: dict):
    """图像增强：对比度、亮度、直方图均衡化、去噪、锐化
    
    ⚡ 并发性能：通过 asyncio.to_thread 把 PIL/numpy CPU 操作移到线程池，
    多个 enhance 请求可以真正并发执行（不再阻塞 event loop）。
    """
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    method = request.get("method", "histogram")
    params = request.get("params", {})
    file_info = uploaded_files[file_id]

    try:
        result = await asyncio.to_thread(
            _do_preprocess_enhance, file_info["file_path"], file_id, method, params,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def _do_preprocess_convert(file_path: str, file_id: str, target_format: str) -> dict:
    """同步执行的格式转换逻辑"""
    from PIL import Image

    img = Image.open(file_path).convert("RGB")
    output_filename = f"{file_id}_converted.{target_format}"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    if target_format in ["jpg", "jpeg"]:
        img.save(output_path, "JPEG", quality=95)
    elif target_format in ["tif", "tiff"]:
        img.save(output_path, "TIFF")
    else:
        img.save(output_path, "PNG")

    file_size = os.path.getsize(output_path)
    return {
        "message": f"格式转换完成 → {target_format.upper()}",
        "output_path": output_path,
        "download_url": f"/preprocess/download/{output_filename}",
        "file_size": file_size,
        "format": target_format,
    }


@router.post("/preprocess/convert")
async def preprocess_convert(request: dict):
    """格式转换：GeoTIFF ↔ PNG/JPG （并发安全：用 to_thread 卸载到线程池）"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    target_format = request.get("format", "png").lower()
    if target_format not in ["png", "jpg", "jpeg", "tif", "tiff"]:
        raise HTTPException(status_code=400, detail=f"不支持的目标格式: {target_format}")

    file_info = uploaded_files[file_id]
    try:
        return await asyncio.to_thread(
            _do_preprocess_convert, file_info["file_path"], file_id, target_format,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preprocess/preview/{filename}")
async def preprocess_preview(filename: str):
    """获取预处理结果预览"""
    safe_name = os.path.basename(filename)
    filepath = os.path.join(OUTPUT_DIR, safe_name)
    if not os.path.exists(filepath) or not filepath.startswith(str(OUTPUT_DIR)):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(filepath, media_type="image/png")


@router.get("/preprocess/download/{filename}")
async def preprocess_download(filename: str):
    """下载预处理结果"""
    safe_name = os.path.basename(filename)
    filepath = os.path.join(OUTPUT_DIR, safe_name)
    if not os.path.exists(filepath) or not filepath.startswith(str(OUTPUT_DIR)):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(filepath, filename=safe_name)


@router.get("/gpu-status")
async def get_gpu_status():
    """获取 GPU 状态"""
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            mem_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            mem_used = torch.cuda.memory_allocated(0) / (1024**3)
            mem_cached = torch.cuda.memory_reserved(0) / (1024**3)
            return {
                "available": True,
                "gpu_name": gpu_name,
                "memory_total_gb": round(mem_total, 2),
                "memory_used_gb": round(mem_used, 2),
                "memory_cached_gb": round(mem_cached, 2),
                "utilization_pct": round(mem_used / mem_total * 100, 1) if mem_total > 0 else 0,
            }
        else:
            return {"available": False, "gpu_name": "N/A"}
    except ImportError:
        return {"available": False, "gpu_name": "PyTorch not installed"}


# ============================================================
# 下游任务通用 — 安全加载超大遥感影像
# ============================================================

def _load_image_safe(file_path: str, max_dim: int = 4096):
    """
    安全加载可能超大的遥感图像。
    自动处理 PIL MAX_IMAGE_PIXELS 限制和 OpenCV CV_IO_MAX_IMAGE_PIXELS 限制。
    超过 max_dim 的图像会被等比缩放。
    返回 (numpy RGB array, original_size_tuple, was_resized_bool)
    """
    from PIL import Image
    import numpy as np

    Image.MAX_IMAGE_PIXELS = None  # 允许超大图

    try:
        img = Image.open(file_path)
    except Exception:
        import rasterio
        with rasterio.open(file_path) as src:
            bands = src.read()
            if bands.shape[0] >= 3:
                rgb = np.stack([bands[0], bands[1], bands[2]], axis=-1)
            else:
                rgb = np.stack([bands[0]] * 3, axis=-1)
            img = Image.fromarray(rgb.astype(np.uint8))

    img = img.convert("RGB")
    orig_w, orig_h = img.size
    was_resized = False

    if max(orig_w, orig_h) > max_dim:
        ratio = max_dim / max(orig_w, orig_h)
        new_w, new_h = int(orig_w * ratio), int(orig_h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        was_resized = True
        print(f"[下游任务] 图像从 {orig_w}x{orig_h} 缩放到 {new_w}x{new_h}")

    return np.array(img), (orig_w, orig_h), was_resized


# ============================================================
# 下游任务 API - YOLOv8 目标检测
# ============================================================

_yolo_model = None
_yolo_is_obb = False

DOTA_CLASSES_CN = {
    "plane": "飞机", "ship": "船舶",
    "storage tank": "储罐", "storage-tank": "储罐",
    "baseball diamond": "棒球场", "baseball-diamond": "棒球场",
    "tennis court": "网球场", "tennis-court": "网球场",
    "basketball court": "篮球场", "basketball-court": "篮球场",
    "ground track field": "田径场", "ground-track-field": "田径场",
    "harbor": "港口", "bridge": "桥梁",
    "large vehicle": "大型车辆", "large-vehicle": "大型车辆",
    "small vehicle": "小型车辆", "small-vehicle": "小型车辆",
    "helicopter": "直升机",
    "roundabout": "环形交叉口",
    "soccer ball field": "足球场", "soccer-ball-field": "足球场",
    "swimming pool": "游泳池", "swimming-pool": "游泳池",
}

def _get_yolo_model():
    global _yolo_model, _yolo_is_obb
    if _yolo_model is None:
        from ultralytics import YOLO
        weights_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "weights", "yolov8")
        obb_path = os.path.join(weights_dir, "yolov8s-obb.pt")
        if os.path.exists(obb_path):
            _yolo_model = YOLO(obb_path)
            _yolo_is_obb = True
            print(f"[检测] 已加载遥感 OBB 模型 (DOTAv1 15类): {obb_path}")
        else:
            fallback = os.path.join(weights_dir, "yolov8n.pt")
            if not os.path.exists(fallback):
                raise FileNotFoundError(f"YOLOv8 权重不存在: {weights_dir}")
            _yolo_model = YOLO(fallback)
            _yolo_is_obb = False
            print(f"[检测] OBB 模型不存在，回退到通用模型: {fallback}")
    return _yolo_model


@router.post("/detect")
async def detect_objects(request: dict, background_tasks: BackgroundTasks):
    """YOLOv8 目标检测"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    confidence = request.get("confidence", 0.25)
    
    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id,
        "type": "object_detection",
        "status": "pending",
        "progress": 0.0,
        "message": "目标检测任务已创建",
        "created_at": datetime.now().isoformat(),
        "result": None,
    }
    save_tasks()
    
    background_tasks.add_task(run_detection, task_id, uploaded_files[file_id], confidence)
    return {"task_id": task_id, "status": "pending"}


def run_detection(task_id: str, file_info: dict, confidence: float):
    """运行 YOLOv8 目标检测"""
    import traceback
    import numpy as np
    from PIL import Image
    
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 10.0
        tasks_db[task_id]["message"] = "正在加载模型..."
        save_tasks()
        
        model = _get_yolo_model()
        
        tasks_db[task_id]["progress"] = 30.0
        tasks_db[task_id]["message"] = "正在运行目标检测..."
        save_tasks()
        
        img_arr, orig_size, was_resized = _load_image_safe(file_info["file_path"], max_dim=2048)
        img = Image.fromarray(img_arr)
        results = model.predict(img, conf=confidence, verbose=False)
        
        tasks_db[task_id]["progress"] = 70.0
        tasks_db[task_id]["message"] = "正在生成结果..."
        save_tasks()
        
        # 保存结果图
        output_dir = os.path.join(OUTPUT_DIR, f"detection_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        # 保存原图
        original_path = os.path.join(output_dir, "original.png")
        img.save(original_path)
        
        # 保存标注后的图
        result_img = results[0].plot()
        result_path = os.path.join(output_dir, "result.png")
        Image.fromarray(result_img).save(result_path)
        
        # 提取检测结果（兼容 OBB 和标准检测）
        detections = []
        if _yolo_is_obb and hasattr(results[0], 'obb') and results[0].obb is not None:
            obb = results[0].obb
            if len(obb) > 0:
                for i in range(len(obb)):
                    cls_id = int(obb.cls[i].item())
                    conf = float(obb.conf[i].item())
                    cls_name = model.names[cls_id]
                    cls_cn = DOTA_CLASSES_CN.get(cls_name, cls_name)
                    xywhr = obb.xywhr[i].tolist()
                    detections.append({
                        "class": cls_cn,
                        "class_en": cls_name,
                        "class_id": cls_id,
                        "confidence": round(conf, 3),
                        "bbox": [round(v) for v in xywhr[:4]],
                        "rotation": round(xywhr[4], 2) if len(xywhr) > 4 else 0,
                    })
        else:
            boxes = results[0].boxes
            if boxes is not None and len(boxes) > 0:
                for i in range(len(boxes)):
                    cls_id = int(boxes.cls[i].item())
                    conf = float(boxes.conf[i].item())
                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                    cls_name = model.names[cls_id]
                    detections.append({
                        "class": cls_name,
                        "class_id": cls_id,
                        "confidence": round(conf, 3),
                        "bbox": [round(x1), round(y1), round(x2), round(y2)],
                    })
        
        # 统计
        class_counts = {}
        for d in detections:
            class_counts[d["class"]] = class_counts.get(d["class"], 0) + 1
        
        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = f"检测完成，发现 {len(detections)} 个目标"
        tasks_db[task_id]["result"] = {
            "output_dir": output_dir,
            "original_path": original_path,
            "result_path": result_path,
            "num_detections": len(detections),
            "detections": detections[:100],
            "class_counts": class_counts,
            "image_size": [img.width, img.height],
        }
        save_tasks()
        print(f"[目标检测] 完成: {len(detections)} 个目标")
        
    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"检测失败: {str(e)}"
        save_tasks()


@router.get("/detection/{task_id}/result")
async def get_detection_result(task_id: str):
    """获取检测结果图"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("result_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["result_path"], media_type="image/png")


@router.get("/detection/{task_id}/original")
async def get_detection_original(task_id: str):
    """获取检测原图"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("original_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["original_path"], media_type="image/png")


# ============================================================
# 下游任务 API - TTST 遥感超分辨率
# ============================================================

@router.post("/super-resolution")
async def super_resolution(request: dict, background_tasks: BackgroundTasks):
    """TTST 遥感超分辨率（IEEE TIP 2024）"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    scale = request.get("scale", 4)
    
    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id,
        "type": "super_resolution",
        "status": "pending",
        "progress": 0.0,
        "message": "超分辨率任务已创建",
        "created_at": datetime.now().isoformat(),
        "result": None,
    }
    save_tasks()
    
    background_tasks.add_task(run_super_resolution, task_id, uploaded_files[file_id], scale)
    return {"task_id": task_id, "status": "pending"}


def run_super_resolution(task_id: str, file_info: dict, scale: int):
    """运行 TTST 遥感超分辨率（IEEE TIP 2024, 遥感专用 Transformer）"""
    import traceback
    import numpy as np
    from PIL import Image
    import torch
    import cv2
    
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 10.0
        tasks_db[task_id]["message"] = "正在加载图像..."
        save_tasks()
        
        img_arr, orig_size, _ = _load_image_safe(file_info["file_path"], max_dim=1024)
        img = Image.fromarray(img_arr)
        in_w, in_h = img.size
        
        tasks_db[task_id]["progress"] = 30.0
        tasks_db[task_id]["message"] = "正在加载 TTST 遥感超分模型..."
        save_tasks()
        
        try:
            weights_base = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            ttst_path = os.path.join(weights_base, "weights", "ttst", "ttst_4x.pth")
            
            if os.path.exists(ttst_path):
                from backend.utils.ttst_sr import TTSTSR
                upsampler = TTSTSR(
                    weight_path=ttst_path, scale=4,
                    tile=128, tile_pad=8, half=False,
                )
                tasks_db[task_id]["progress"] = 50.0
                tasks_db[task_id]["message"] = f"正在进行 TTST {scale}x 遥感超分..."
                save_tasks()
            else:
                from backend.utils.rrdbnet_sr import RRDBNetSR
                satlas_path = os.path.join(weights_base, "weights", "realesrgan", "satlas_esrgan_sr4.pth")
                if not os.path.exists(satlas_path):
                    raise FileNotFoundError(f"超分模型权重不存在")
                upsampler = RRDBNetSR(
                    weight_path=satlas_path, scale=4,
                    tile=256, tile_pad=10, half=torch.cuda.is_available(),
                )
                tasks_db[task_id]["progress"] = 50.0
                tasks_db[task_id]["message"] = f"正在进行 Satlas ESRGAN {scale}x 遥感超分..."
                save_tasks()
            
            img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            output, _ = upsampler.enhance(img_cv, outscale=scale)
            result_array = cv2.cvtColor(output, cv2.COLOR_BGR2RGB)
            result_img = Image.fromarray(result_array)
            
        except Exception as esrgan_err:
            print(f"[超分] 模型推理失败，回退到 bicubic: {esrgan_err}")
            import torch.nn.functional as F
            img_tensor = torch.from_numpy(np.array(img)).permute(2, 0, 1).unsqueeze(0).float() / 255.0
            if torch.cuda.is_available():
                img_tensor = img_tensor.cuda()
            with torch.no_grad():
                upscaled = F.interpolate(img_tensor, size=(in_h * scale, in_w * scale), mode='bicubic', align_corners=False).clamp(0, 1)
            result_array = (upscaled.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8)
            result_img = Image.fromarray(result_array)
        
        out_w, out_h = result_img.size
        
        tasks_db[task_id]["progress"] = 80.0
        tasks_db[task_id]["message"] = "正在保存结果..."
        save_tasks()
        
        output_dir = os.path.join(OUTPUT_DIR, f"sr_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        original_path = os.path.join(output_dir, "original.png")
        img.save(original_path)
        
        result_path = os.path.join(output_dir, "result.png")
        result_img.save(result_path, quality=95)
        
        preview = result_img.copy()
        preview.thumbnail((1024, 1024))
        preview_path = os.path.join(output_dir, "preview.png")
        preview.save(preview_path)
        
        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = f"超分完成: {in_w}×{in_h} → {out_w}×{out_h}"
        tasks_db[task_id]["result"] = {
            "output_dir": output_dir,
            "original_path": original_path,
            "result_path": result_path,
            "preview_path": preview_path,
            "original_size": [in_w, in_h],
            "result_size": [out_w, out_h],
            "scale": scale,
        }
        save_tasks()
        print(f"[超分辨率] 完成: {in_w}x{in_h} -> {out_w}x{out_h}")
        
        torch.cuda.empty_cache()
        
    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"超分失败: {str(e)}"
        save_tasks()


@router.get("/sr/{task_id}/result")
async def get_sr_result(task_id: str):
    """获取超分结果预览"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result:
        raise HTTPException(status_code=404, detail="结果不存在")
    preview = result.get("preview_path") or result.get("result_path")
    if not preview or not os.path.exists(preview):
        raise HTTPException(status_code=404, detail="预览不存在")
    return FileResponse(preview, media_type="image/png")


@router.get("/sr/{task_id}/download")
async def download_sr_result(task_id: str):
    """下载超分结果（全分辨率）"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("result_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    path = result["result_path"]
    return FileResponse(path, media_type="image/png", filename=f"sr_{task_id}_x{result.get('scale', 4)}.png")


# ============================================================
# 下游任务 API - 边缘检测 (OpenCV Canny)
# ============================================================

@router.post("/edge-detection")
async def edge_detection(request: dict, background_tasks: BackgroundTasks):
    """OpenCV Canny 边缘检测"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    low_threshold = request.get("low_threshold", 50)
    high_threshold = request.get("high_threshold", 150)
    
    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id,
        "type": "edge_detection",
        "status": "pending",
        "progress": 0.0,
        "message": "边缘检测任务已创建",
        "created_at": datetime.now().isoformat(),
        "result": None,
    }
    save_tasks()
    
    background_tasks.add_task(run_edge_detection, task_id, uploaded_files[file_id], low_threshold, high_threshold)
    return {"task_id": task_id, "status": "pending"}


def run_edge_detection(task_id: str, file_info: dict, low_thresh: int, high_thresh: int):
    """运行 Canny 边缘检测"""
    import traceback
    import numpy as np
    from PIL import Image
    import cv2
    
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 20.0
        tasks_db[task_id]["message"] = "正在加载图像..."
        save_tasks()
        
        img, orig_size, was_resized = _load_image_safe(file_info["file_path"], max_dim=4096)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        
        tasks_db[task_id]["progress"] = 50.0
        tasks_db[task_id]["message"] = "正在进行边缘检测..."
        save_tasks()
        
        blurred = cv2.GaussianBlur(gray, (5, 5), 1.4)
        edges = cv2.Canny(blurred, low_thresh, high_thresh)
        
        # 形态学操作增强边缘
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        edges = cv2.dilate(edges, kernel, iterations=1)
        
        tasks_db[task_id]["progress"] = 80.0
        tasks_db[task_id]["message"] = "正在保存结果..."
        save_tasks()
        
        output_dir = os.path.join(OUTPUT_DIR, f"edge_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        original_path = os.path.join(output_dir, "original.png")
        Image.fromarray(img).save(original_path)
        
        # 白色边缘 + 黑色背景
        result_path = os.path.join(output_dir, "result.png")
        Image.fromarray(edges).save(result_path)
        
        # 彩色叠加版本：绿色边缘叠加在原图上
        overlay = img.copy()
        overlay[edges > 0] = [0, 255, 0]
        overlay_path = os.path.join(output_dir, "overlay.png")
        Image.fromarray(overlay).save(overlay_path)
        
        edge_pixels = int(np.sum(edges > 0))
        total_pixels = edges.shape[0] * edges.shape[1]
        
        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = f"边缘检测完成，提取 {edge_pixels} 个边缘像素"
        tasks_db[task_id]["result"] = {
            "output_dir": output_dir,
            "original_path": original_path,
            "result_path": result_path,
            "overlay_path": overlay_path,
            "edge_pixels": edge_pixels,
            "total_pixels": total_pixels,
            "edge_ratio": round(edge_pixels / total_pixels * 100, 2),
            "image_size": [img.shape[1], img.shape[0]],
        }
        save_tasks()
        
    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"边缘检测失败: {str(e)}"
        save_tasks()


@router.get("/edge/{task_id}/result")
async def get_edge_result(task_id: str, overlay: bool = False):
    """获取边缘检测结果"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result:
        raise HTTPException(status_code=404, detail="结果不存在")
    path = result.get("overlay_path" if overlay else "result_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="结果文件不存在")
    return FileResponse(path, media_type="image/png")


# ============================================================
# 下游任务 API - 去云去雾 (DCP 暗通道先验)
# ============================================================

@router.post("/dehaze")
async def dehaze(request: dict, background_tasks: BackgroundTasks):
    """DCP 暗通道先验去雾"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id, "type": "dehaze", "status": "pending",
        "progress": 0.0, "message": "去雾任务已创建",
        "created_at": datetime.now().isoformat(), "result": None,
    }
    save_tasks()
    background_tasks.add_task(run_dehaze, task_id, uploaded_files[file_id])
    return {"task_id": task_id, "status": "pending"}


def run_dehaze(task_id: str, file_info: dict):
    """DCP 暗通道先验去雾"""
    import traceback, numpy as np, cv2
    from PIL import Image
    
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 20.0
        tasks_db[task_id]["message"] = "正在加载图像..."
        save_tasks()
        
        img_rgb, orig_size, was_resized = _load_image_safe(file_info["file_path"], max_dim=4096)
        img = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
        
        tasks_db[task_id]["progress"] = 40.0
        tasks_db[task_id]["message"] = "正在执行暗通道先验去雾..."
        save_tasks()
        
        # DCP 暗通道先验
        def dark_channel(im, sz):
            b, g, r = cv2.split(im)
            dc = cv2.min(cv2.min(r, g), b)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (sz, sz))
            dark = cv2.erode(dc, kernel)
            return dark
        
        def atmospheric_light(im, dark):
            h, w = im.shape[:2]
            sz = max(h * w // 1000, 1)
            dark_vec = dark.reshape(-1)
            indices = np.argsort(dark_vec)[-sz:]
            atm = np.mean(im.reshape(-1, 3)[indices], axis=0)
            return atm
        
        def transmission_estimate(im, A, sz, omega=0.95):
            norm = im.astype(np.float64) / A
            t = 1 - omega * dark_channel(norm, sz)
            return t
        
        def guided_filter(I, p, r, eps):
            mean_I = cv2.boxFilter(I, cv2.CV_64F, (r, r))
            mean_p = cv2.boxFilter(p, cv2.CV_64F, (r, r))
            mean_Ip = cv2.boxFilter(I * p, cv2.CV_64F, (r, r))
            cov_Ip = mean_Ip - mean_I * mean_p
            mean_II = cv2.boxFilter(I * I, cv2.CV_64F, (r, r))
            var_I = mean_II - mean_I * mean_I
            a = cov_Ip / (var_I + eps)
            b = mean_p - a * mean_I
            mean_a = cv2.boxFilter(a, cv2.CV_64F, (r, r))
            mean_b = cv2.boxFilter(b, cv2.CV_64F, (r, r))
            return mean_a * I + mean_b
        
        I = img.astype(np.float64) / 255.0
        dark = dark_channel(I, 15)
        A = atmospheric_light(I, dark)
        te = transmission_estimate(I, A, 15)
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float64) / 255.0
        t_refined = guided_filter(gray, te, 60, 1e-3)
        t_refined = np.clip(t_refined, 0.1, 1.0)
        
        tasks_db[task_id]["progress"] = 70.0
        tasks_db[task_id]["message"] = "正在恢复图像..."
        save_tasks()
        
        result = np.zeros_like(I)
        for c in range(3):
            result[:, :, c] = (I[:, :, c] - A[c]) / t_refined + A[c]
        result = np.clip(result * 255, 0, 255).astype(np.uint8)
        
        output_dir = os.path.join(OUTPUT_DIR, f"dehaze_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        original_path = os.path.join(output_dir, "original.png")
        cv2.imwrite(original_path, img)
        
        result_path = os.path.join(output_dir, "result.png")
        cv2.imwrite(result_path, result)
        
        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        resize_note = f"（原图 {orig_size[0]}x{orig_size[1]}，已自动缩放处理）" if was_resized else ""
        tasks_db[task_id]["message"] = f"去雾处理完成{resize_note}"
        tasks_db[task_id]["result"] = {
            "output_dir": output_dir,
            "original_path": original_path,
            "result_path": result_path,
            "image_size": [img.shape[1], img.shape[0]],
            "original_size": list(orig_size),
            "was_resized": was_resized,
        }
        save_tasks()
        
    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"去雾失败: {str(e)}"
        save_tasks()


@router.get("/dehaze/{task_id}/result")
async def get_dehaze_result(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("result_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["result_path"], media_type="image/png")


# ============================================================
# 下游任务 API - 变化检测 (像素级差分)
# ============================================================

@router.post("/change-detection")
async def change_detection(request: dict, background_tasks: BackgroundTasks):
    """遥感变化检测（双图输入）"""
    file_id_1 = request.get("file_id_1")
    file_id_2 = request.get("file_id_2")
    if not file_id_1 or file_id_1 not in uploaded_files:
        raise HTTPException(status_code=404, detail="时相1图像不存在")
    if not file_id_2 or file_id_2 not in uploaded_files:
        raise HTTPException(status_code=404, detail="时相2图像不存在")
    
    threshold = request.get("threshold", 30)
    
    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id, "type": "change_detection", "status": "pending",
        "progress": 0.0, "message": "变化检测任务已创建",
        "created_at": datetime.now().isoformat(), "result": None,
    }
    save_tasks()
    background_tasks.add_task(run_change_detection, task_id, uploaded_files[file_id_1], uploaded_files[file_id_2], threshold)
    return {"task_id": task_id, "status": "pending"}


def run_change_detection(task_id: str, file_info_1: dict, file_info_2: dict, threshold: int):
    """像素级差分变化检测"""
    import traceback, numpy as np, cv2
    from PIL import Image
    
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 20.0
        tasks_db[task_id]["message"] = "正在加载双时相图像..."
        save_tasks()
        
        img1, _, _ = _load_image_safe(file_info_1["file_path"], max_dim=4096)
        img2, _, _ = _load_image_safe(file_info_2["file_path"], max_dim=4096)
        
        # 确保尺寸一致
        h = min(img1.shape[0], img2.shape[0])
        w = min(img1.shape[1], img2.shape[1])
        img1 = cv2.resize(img1, (w, h))
        img2 = cv2.resize(img2, (w, h))
        
        tasks_db[task_id]["progress"] = 50.0
        tasks_db[task_id]["message"] = "正在计算变化区域..."
        save_tasks()
        
        # 差分
        diff = cv2.absdiff(img1, img2)
        gray_diff = cv2.cvtColor(diff, cv2.COLOR_RGB2GRAY)
        _, change_mask = cv2.threshold(gray_diff, threshold, 255, cv2.THRESH_BINARY)
        
        # 形态学操作去噪
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        change_mask = cv2.morphologyEx(change_mask, cv2.MORPH_OPEN, kernel)
        change_mask = cv2.morphologyEx(change_mask, cv2.MORPH_CLOSE, kernel)
        
        # 变化区域标红叠加在时相2上
        overlay = img2.copy()
        overlay[change_mask > 0] = [255, 0, 0]
        blended = cv2.addWeighted(img2, 0.6, overlay, 0.4, 0)
        
        changed_pixels = int(np.sum(change_mask > 0))
        total_pixels = h * w
        
        tasks_db[task_id]["progress"] = 80.0
        tasks_db[task_id]["message"] = "正在保存结果..."
        save_tasks()
        
        output_dir = os.path.join(OUTPUT_DIR, f"cd_{task_id}")
        os.makedirs(output_dir, exist_ok=True)
        
        Image.fromarray(img1).save(os.path.join(output_dir, "t1.png"))
        Image.fromarray(img2).save(os.path.join(output_dir, "t2.png"))
        Image.fromarray(change_mask).save(os.path.join(output_dir, "mask.png"))
        result_path = os.path.join(output_dir, "result.png")
        Image.fromarray(blended).save(result_path)
        
        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = f"变化检测完成，变化区域 {changed_pixels} 像素 ({round(changed_pixels/total_pixels*100, 1)}%)"
        tasks_db[task_id]["result"] = {
            "output_dir": output_dir,
            "result_path": result_path,
            "changed_pixels": changed_pixels,
            "total_pixels": total_pixels,
            "change_ratio": round(changed_pixels / total_pixels * 100, 2),
            "image_size": [w, h],
        }
        save_tasks()
        
    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"变化检测失败: {str(e)}"
        save_tasks()


@router.get("/cd/{task_id}/result")
async def get_cd_result(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("result_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["result_path"], media_type="image/png")


# ============================================================
# 下游任务 API - 建筑物提取（基于 SAM3 + building 提示词）
# ============================================================

@router.post("/building-extraction")
async def building_extraction(request: dict, background_tasks: BackgroundTasks):
    """建筑物提取（开放词汇分割 + building 类）"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    threshold = float(request.get("threshold", 0.4))

    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id, "type": "building_extraction", "status": "pending",
        "progress": 0.0, "message": "建筑物提取任务已创建",
        "created_at": datetime.now().isoformat(), "result": None,
    }
    save_tasks()
    background_tasks.add_task(
        _run_class_extraction, task_id, uploaded_files[file_id],
        ["building"], threshold, "building_extraction", "building", (255, 87, 87),
    )
    return {"task_id": task_id, "status": "pending"}


@router.get("/building/{task_id}/result")
async def get_building_result(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("overlay_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["overlay_path"], media_type="image/png")


# ============================================================
# 下游任务 API - 道路提取（基于 SAM3 + road 提示词）
# ============================================================

@router.post("/road-extraction")
async def road_extraction(request: dict, background_tasks: BackgroundTasks):
    """道路提取（开放词汇分割 + road 类）"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    threshold = float(request.get("threshold", 0.35))

    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id, "type": "road_extraction", "status": "pending",
        "progress": 0.0, "message": "道路提取任务已创建",
        "created_at": datetime.now().isoformat(), "result": None,
    }
    save_tasks()
    background_tasks.add_task(
        _run_class_extraction, task_id, uploaded_files[file_id],
        ["road"], threshold, "road_extraction", "road", (255, 209, 102),
    )
    return {"task_id": task_id, "status": "pending"}


@router.get("/road/{task_id}/result")
async def get_road_result(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("overlay_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["overlay_path"], media_type="image/png")


def _run_class_extraction(
    task_id: str,
    file_info: dict,
    class_names: list,
    threshold: float,
    out_prefix: str,
    short_name: str,
    overlay_color: tuple,
):
    """通用「单类别提取」后台任务（SAM3 PRISM-A 模式 + 颜色叠加）"""
    import traceback
    import numpy as np
    from PIL import Image
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 15.0
        tasks_db[task_id]["message"] = f"正在加载图像并准备 {short_name} 模型..."
        save_tasks()

        img, _orig_size, _was_resized = _load_image_safe(file_info["file_path"], max_dim=2048)

        # 使用 backend.core.predictor + SegEarth-OV-3 PRISM-A 单类策略
        from backend.config import MODEL_CONFIG, SEGEARTH_STRATEGY
        from backend.core.predictor import get_predictor

        tasks_db[task_id]["progress"] = 30.0
        tasks_db[task_id]["message"] = f"SAM3 推理中({short_name})..."
        save_tasks()

        predictor = get_predictor(
            bpe_path=MODEL_CONFIG["bpe_path"],
            checkpoint_path=MODEL_CONFIG["checkpoint_path"],
            device=MODEL_CONFIG["device"],
            confidence_threshold=MODEL_CONFIG["confidence_threshold"],
        )

        invalid_mask = np.zeros(img.shape[:2], dtype=bool)
        prompts = {cn: cn for cn in class_names}
        prediction, _presence = predictor.predict_full_image(
            img_np=img,
            invalid_mask=invalid_mask,
            classes=class_names,
            prompts=prompts,
            crop_size=512,
            stride=384,
            use_sem_seg=SEGEARTH_STRATEGY["use_sem_seg"],
            use_transformer_decoder=SEGEARTH_STRATEGY["use_transformer_decoder"],
            use_presence_score=SEGEARTH_STRATEGY["use_presence_score"],
            prob_thd=threshold,
            bg_idx=SEGEARTH_STRATEGY["bg_idx"],
        )
        # prediction: HxW uint8, 0=background, 1=class_names[0], ...
        binary = ((prediction >= 1).astype(np.uint8)) * 255

        tasks_db[task_id]["progress"] = 75.0
        tasks_db[task_id]["message"] = "正在生成结果叠加图..."
        save_tasks()

        overlay = img.copy()
        m = binary > 0
        overlay[m] = (
            np.array(overlay_color, dtype=np.float32) * 0.55 + overlay[m] * 0.45
        ).astype(np.uint8)

        out_dir = os.path.join(OUTPUT_DIR, f"{out_prefix}_{task_id}")
        os.makedirs(out_dir, exist_ok=True)
        original_path = os.path.join(out_dir, "original.png")
        mask_path = os.path.join(out_dir, "mask.png")
        overlay_path = os.path.join(out_dir, "overlay.png")
        Image.fromarray(img).save(original_path)
        Image.fromarray(binary).save(mask_path)
        Image.fromarray(overlay).save(overlay_path)

        target_pixels = int(m.sum())
        total_pixels = int(m.size)

        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = (
            f"{short_name} 提取完成，目标占比 {target_pixels/total_pixels*100:.2f}%"
        )
        tasks_db[task_id]["result"] = {
            "output_dir": out_dir,
            "original_path": original_path,
            "mask_path": mask_path,
            "overlay_path": overlay_path,
            "result_path": overlay_path,  # 兼容统一接口
            "target_pixels": target_pixels,
            "total_pixels": total_pixels,
            "target_ratio": round(target_pixels / total_pixels * 100, 2),
            "image_size": [img.shape[1], img.shape[0]],
            "threshold": threshold,
        }
        save_tasks()

    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"{short_name} 提取失败: {str(e)}"
        save_tasks()


# ============================================================
# 下游任务 API - NDVI 植被指数分析
# 公式: NDVI = (NIR - RED) / (NIR + RED)
# 对纯 RGB 图像采用绿/红比值近似（仅做示意，鼓励上传含 NIR 波段的多光谱）
# ============================================================

@router.post("/ndvi-analysis")
async def ndvi_analysis(request: dict, background_tasks: BackgroundTasks):
    """NDVI 植被指数分析"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    threshold = float(request.get("threshold", 0.2))  # NDVI > 阈值 视为植被

    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id, "type": "ndvi_analysis", "status": "pending",
        "progress": 0.0, "message": "NDVI 分析任务已创建",
        "created_at": datetime.now().isoformat(), "result": None,
    }
    save_tasks()
    background_tasks.add_task(run_ndvi_analysis, task_id, uploaded_files[file_id], threshold)
    return {"task_id": task_id, "status": "pending"}


def run_ndvi_analysis(task_id: str, file_info: dict, threshold: float):
    """计算 NDVI（含 NIR 波段时用真值，否则用 G/R 近似）+ 配色图"""
    import traceback
    import numpy as np
    from PIL import Image
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 20.0
        tasks_db[task_id]["message"] = "正在加载多光谱影像..."
        save_tasks()

        # 优先尝试用 rasterio 读 NIR 波段
        nir = None
        red = None
        rgb_for_display = None
        try:
            import rasterio
            with rasterio.open(file_info["file_path"]) as src:
                bands = src.read()
                if bands.shape[0] >= 4:
                    # 假设 [R, G, B, NIR] 顺序（landsat8/sentinel2 常见）
                    red = bands[0].astype(np.float32)
                    nir = bands[3].astype(np.float32)
                    rgb_for_display = np.stack([
                        bands[0], bands[1] if bands.shape[0] >= 2 else bands[0],
                        bands[2] if bands.shape[0] >= 3 else bands[0]
                    ], axis=-1).astype(np.uint8)
        except Exception:
            pass

        approx_mode = False
        if nir is None or red is None:
            # 回退：用 PIL/JPG 三通道，G/R 比值近似 NDVI
            img, _, _ = _load_image_safe(file_info["file_path"], max_dim=2048)
            rgb_for_display = img
            r = img[..., 0].astype(np.float32)
            g = img[..., 1].astype(np.float32)
            # 近似 NDVI ≈ (G - R) / (G + R)
            denom = (g + r).clip(min=1.0)
            ndvi = (g - r) / denom
            approx_mode = True
        else:
            denom = (nir + red).clip(min=1e-6)
            ndvi = (nir - red) / denom

        ndvi = np.clip(ndvi, -1.0, 1.0)

        tasks_db[task_id]["progress"] = 60.0
        tasks_db[task_id]["message"] = "正在生成 NDVI 配色图..."
        save_tasks()

        # 着色：[-1, 1] → 红→黄→绿
        def colorize_ndvi(v):
            n = ((v + 1.0) / 2.0 * 255.0).astype(np.uint8)  # 0..255
            try:
                import cv2
                color = cv2.applyColorMap(n, cv2.COLORMAP_RDYLGN)
                color = color[..., ::-1]  # BGR → RGB
            except Exception:
                # 简易回退：手工渐变
                color = np.zeros((*n.shape, 3), dtype=np.uint8)
                color[..., 0] = (255 - n).astype(np.uint8)  # R 高在低 NDVI
                color[..., 1] = n.astype(np.uint8)          # G 高在高 NDVI
            return color

        ndvi_color = colorize_ndvi(ndvi)
        veg_mask = (ndvi > threshold)
        veg_pixels = int(veg_mask.sum())
        total_pixels = int(ndvi.size)

        # 把植被区域叠加在 RGB 上
        if rgb_for_display is None:
            rgb_for_display = np.zeros((*ndvi.shape, 3), dtype=np.uint8)
        if rgb_for_display.shape[:2] != ndvi.shape:
            from PIL import Image as PILI
            rgb_for_display = np.array(
                PILI.fromarray(rgb_for_display).resize((ndvi.shape[1], ndvi.shape[0]))
            )
        overlay = rgb_for_display.copy()
        overlay[veg_mask] = (
            np.array([116, 250, 189], dtype=np.float32) * 0.45 + overlay[veg_mask] * 0.55
        ).astype(np.uint8)

        out_dir = os.path.join(OUTPUT_DIR, f"ndvi_{task_id}")
        os.makedirs(out_dir, exist_ok=True)
        original_path = os.path.join(out_dir, "original.png")
        ndvi_color_path = os.path.join(out_dir, "ndvi_colored.png")
        veg_mask_path = os.path.join(out_dir, "veg_mask.png")
        overlay_path = os.path.join(out_dir, "overlay.png")

        Image.fromarray(rgb_for_display).save(original_path)
        Image.fromarray(ndvi_color).save(ndvi_color_path)
        Image.fromarray((veg_mask.astype(np.uint8) * 255)).save(veg_mask_path)
        Image.fromarray(overlay).save(overlay_path)

        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        ndvi_min, ndvi_max, ndvi_mean = float(ndvi.min()), float(ndvi.max()), float(ndvi.mean())
        tasks_db[task_id]["message"] = (
            f"NDVI 分析完成，{'(RGB 近似)' if approx_mode else '(NIR 真值)'} "
            f"植被占比 {veg_pixels/total_pixels*100:.2f}%"
        )
        tasks_db[task_id]["result"] = {
            "output_dir": out_dir,
            "original_path": original_path,
            "ndvi_color_path": ndvi_color_path,
            "veg_mask_path": veg_mask_path,
            "overlay_path": overlay_path,
            "result_path": ndvi_color_path,  # 默认结果图
            "approx_mode": approx_mode,
            "veg_pixels": veg_pixels,
            "total_pixels": total_pixels,
            "veg_ratio": round(veg_pixels / total_pixels * 100, 2),
            "ndvi_min": round(ndvi_min, 3),
            "ndvi_max": round(ndvi_max, 3),
            "ndvi_mean": round(ndvi_mean, 3),
            "threshold": threshold,
            "image_size": [ndvi.shape[1], ndvi.shape[0]],
        }
        save_tasks()

    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"NDVI 分析失败: {str(e)}"
        save_tasks()


@router.get("/ndvi/{task_id}/result")
async def get_ndvi_result(task_id: str, mode: str = "color"):
    """mode: color | mask | overlay"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result:
        raise HTTPException(status_code=404, detail="结果不存在")
    key = {
        "color": "ndvi_color_path",
        "mask": "veg_mask_path",
        "overlay": "overlay_path",
    }.get(mode, "ndvi_color_path")
    path = result.get(key)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="结果文件不存在")
    return FileResponse(path, media_type="image/png")


# ============================================================
# 下游任务 API - Pansharpening 全色锐化
# Brovey 变换：用高分辨率全色波段 + 低分辨率 RGB 融合
# 单图输入时用拉普拉斯/USM 高频注入近似（演示性）
# ============================================================

@router.post("/pansharpen")
async def pansharpen(request: dict, background_tasks: BackgroundTasks):
    """全色锐化（Brovey 近似）"""
    file_id = request.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="文件不存在")

    boost = float(request.get("boost", 1.6))

    task_id = str(uuid.uuid4())[:8]
    tasks_db[task_id] = {
        "task_id": task_id, "type": "pansharpen", "status": "pending",
        "progress": 0.0, "message": "全色锐化任务已创建",
        "created_at": datetime.now().isoformat(), "result": None,
    }
    save_tasks()
    background_tasks.add_task(run_pansharpen, task_id, uploaded_files[file_id], boost)
    return {"task_id": task_id, "status": "pending"}


def run_pansharpen(task_id: str, file_info: dict, boost: float):
    """单图近似全色锐化：用 Y 通道高频 + USM 注入到 RGB"""
    import traceback
    import numpy as np
    from PIL import Image
    try:
        tasks_db[task_id]["status"] = "processing"
        tasks_db[task_id]["progress"] = 25.0
        tasks_db[task_id]["message"] = "正在加载图像..."
        save_tasks()

        img, _, _ = _load_image_safe(file_info["file_path"], max_dim=4096)

        try:
            import cv2
            tasks_db[task_id]["progress"] = 55.0
            tasks_db[task_id]["message"] = "正在提取高频细节..."
            save_tasks()

            ycrcb = cv2.cvtColor(img, cv2.COLOR_RGB2YCrCb)
            y = ycrcb[..., 0].astype(np.float32)
            # 高频 = Y - GaussianBlur(Y)
            blur = cv2.GaussianBlur(y, (0, 0), sigmaX=2.5)
            high_freq = y - blur
            # 注入到 Y 通道
            new_y = np.clip(y + high_freq * boost, 0, 255).astype(np.uint8)
            ycrcb[..., 0] = new_y
            sharpened = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2RGB)
        except Exception:
            # 无 cv2 时用 PIL Unsharp Mask 回退
            from PIL import ImageFilter
            pil_img = Image.fromarray(img)
            sharpened = np.array(
                pil_img.filter(ImageFilter.UnsharpMask(radius=2, percent=int(150 * boost), threshold=2))
            )

        tasks_db[task_id]["progress"] = 85.0
        tasks_db[task_id]["message"] = "正在保存结果..."
        save_tasks()

        out_dir = os.path.join(OUTPUT_DIR, f"pan_{task_id}")
        os.makedirs(out_dir, exist_ok=True)
        original_path = os.path.join(out_dir, "original.png")
        result_path = os.path.join(out_dir, "result.png")
        Image.fromarray(img).save(original_path)
        Image.fromarray(sharpened).save(result_path)

        # 简易锐度指标：Laplacian variance（数值越高越锐）
        sharp_metric = 0.0
        try:
            import cv2
            gray_o = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            gray_s = cv2.cvtColor(sharpened, cv2.COLOR_RGB2GRAY)
            lap_o = cv2.Laplacian(gray_o, cv2.CV_64F).var()
            lap_s = cv2.Laplacian(gray_s, cv2.CV_64F).var()
            sharp_metric = round(lap_s / max(lap_o, 1e-6), 3)
        except Exception:
            pass

        tasks_db[task_id]["status"] = "completed"
        tasks_db[task_id]["progress"] = 100.0
        tasks_db[task_id]["message"] = f"全色锐化完成，锐度提升 ×{sharp_metric}"
        tasks_db[task_id]["result"] = {
            "output_dir": out_dir,
            "original_path": original_path,
            "result_path": result_path,
            "boost": boost,
            "sharpness_ratio": sharp_metric,
            "image_size": [img.shape[1], img.shape[0]],
        }
        save_tasks()

    except Exception as e:
        traceback.print_exc()
        tasks_db[task_id]["status"] = "failed"
        tasks_db[task_id]["message"] = f"全色锐化失败: {str(e)}"
        save_tasks()


@router.get("/pansharpen/{task_id}/result")
async def get_pansharpen_result(task_id: str):
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = tasks_db[task_id].get("result")
    if not result or not result.get("result_path"):
        raise HTTPException(status_code=404, detail="结果不存在")
    return FileResponse(result["result_path"], media_type="image/png")


# ============================================================
# 用户自定义模型管理 API
# ============================================================

USER_MODELS_DIR = Path(OUTPUT_DIR).parent / "weights" / "user_models"
USER_MODELS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MODEL_EXTENSIONS = {'.pt', '.pth'}


@router.post("/models/upload")
async def upload_model(file: UploadFile = File(...), display_name: str = ""):
    """上传用户自定义模型权重"""
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext not in ALLOWED_MODEL_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"仅支持 {', '.join(ALLOWED_MODEL_EXTENSIONS)} 格式")

    model_id = str(uuid.uuid4())[:8]
    save_dir = USER_MODELS_DIR / model_id
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / f"model{ext}"

    content = await file.read()
    file_size = len(content)
    if file_size > 5 * 1024 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="模型文件不能超过 5GB")

    with open(save_path, "wb") as f:
        f.write(content)

    # Validate: try loading and check SAM3 compatibility
    valid = True
    error_msg = ""
    param_count = 0
    model_keys_sample = []
    try:
        import torch
        state = torch.load(str(save_path), map_location="cpu", weights_only=False)
        if not isinstance(state, dict):
            valid = False
            error_msg = "文件不是有效的 PyTorch state_dict 格式（需要是 Python dict）"
        else:
            # Count parameters and collect sample keys for diagnostics
            for k, v in state.items():
                if hasattr(v, 'numel'):
                    param_count += v.numel()
            model_keys_sample = list(state.keys())[:10]

            # Try building SAM3 model with this checkpoint to verify architecture compatibility
            try:
                from backend.config import MODEL_CONFIG
                from sam3 import build_sam3_image_model
                _test_model = build_sam3_image_model(
                    bpe_path=MODEL_CONFIG["bpe_path"],
                    checkpoint_path=str(save_path),
                    device="cpu"
                )
                del _test_model
                torch.cuda.empty_cache() if torch.cuda.is_available() else None
            except Exception as arch_err:
                valid = False
                error_msg = f"模型架构与 SAM3 不兼容: {str(arch_err)[:200]}。请确保上传的是基于 SAM3 架构训练的 PyTorch checkpoint (.pt/.pth)"
    except Exception as e:
        valid = False
        error_msg = f"无法加载模型文件: {str(e)[:200]}"

    if not valid:
        shutil.rmtree(save_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=error_msg)

    name = display_name or file.filename or f"model_{model_id}"
    param_str = f"{param_count / 1e6:.1f}M" if param_count > 0 else "unknown"
    user_models_db[model_id] = {
        "model_id": model_id,
        "display_name": name,
        "original_filename": file.filename,
        "file_path": str(save_path),
        "file_size": file_size,
        "uploaded_at": datetime.now().isoformat(),
        "format": ext,
        "status": "ready",
        "param_count": param_str,
        "sample_keys": model_keys_sample,
    }

    return {
        "model_id": model_id,
        "display_name": name,
        "file_size": file_size,
        "status": "ready",
        "param_count": param_str,
        "message": f"模型 '{name}' 上传成功，参数量 {param_str}，SAM3 架构验证通过",
    }


@router.get("/models")
async def list_models():
    """列出所有可用模型（含默认 + 用户上传）"""
    from backend.config import MODEL_CONFIG
    models = [
        {
            "model_id": "default",
            "display_name": "SAM3 (默认)",
            "type": "builtin",
            "status": "ready",
            "file_size": os.path.getsize(MODEL_CONFIG["checkpoint_path"]) if os.path.exists(MODEL_CONFIG["checkpoint_path"]) else 0,
        }
    ]
    for m in user_models_db.values():
        models.append({
            "model_id": m["model_id"],
            "display_name": m["display_name"],
            "type": "user",
            "status": m["status"],
            "file_size": m["file_size"],
            "uploaded_at": m["uploaded_at"],
        })
    return {"models": models}


@router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    """删除用户上传的模型"""
    if model_id == "default":
        raise HTTPException(status_code=400, detail="不能删除默认模型")
    if model_id not in user_models_db:
        raise HTTPException(status_code=404, detail="模型不存在")

    info = user_models_db[model_id]
    model_dir = Path(info["file_path"]).parent
    shutil.rmtree(model_dir, ignore_errors=True)
    del user_models_db[model_id]

    return {"message": f"模型 '{info['display_name']}' 已删除"}


# ============================================================
# 预训练模型库 API（pretrained registry）
# ============================================================

@router.get("/models/pretrained")
async def list_pretrained_models():
    """列出预训练模型库（含每个模型在本地是否已下载状态）"""
    from backend.services.pretrained_registry import list_pretrained
    return {"models": list_pretrained()}


@router.post("/models/pretrained/{model_id}/download")
async def download_pretrained_model(model_id: str):
    """触发预训练模型下载（首次会从 HuggingFace Hub 拉取，后续从本地缓存返回）"""
    from backend.services.pretrained_registry import download_pretrained
    try:
        result = download_pretrained(model_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)[:300]}")


@router.delete("/models/pretrained/{model_id}/cache")
async def remove_pretrained_cache(model_id: str):
    """删除预训练模型本地缓存（释放磁盘空间）"""
    from backend.services.pretrained_registry import remove_pretrained
    try:
        return remove_pretrained(model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================
# 模型对比 API（在同一张图 + 同一个类别上跑 N 个模型）
# ============================================================

@router.post("/models/compare")
async def compare_models(request: dict, background_tasks: BackgroundTasks):
    """
    对比多个模型在同一张图 / 同一个类别上的分割结果。
    
    Body:
      - file_id: 上传文件 id
      - class_name: 目标类别名（如 "building"）
      - prompt: 文字提示词（如 "building rooftop"）
      - model_ids: list[str]，要对比的模型 id 列表（来自 pretrained registry / sam3_default / 用户上传）
      - max_models: 最多 4 个（防止资源压力）
    
    返回:
      - compare_task_id: 异步任务 id，前端可通过 /api/models/compare/{id} 查询进度与结果
    """
    file_id = request.get("file_id")
    class_name = (request.get("class_name") or "").strip()
    prompt = (request.get("prompt") or "").strip() or class_name
    model_ids = request.get("model_ids") or []
    max_models = int(request.get("max_models", 4))

    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=400, detail="无效的 file_id")
    if not class_name:
        raise HTTPException(status_code=400, detail="缺少 class_name")
    if not isinstance(model_ids, list) or len(model_ids) < 1:
        raise HTTPException(status_code=400, detail="至少选择 1 个模型")
    if len(model_ids) > max_models:
        raise HTTPException(status_code=400, detail=f"最多对比 {max_models} 个模型")

    compare_task_id = "cmp_" + str(uuid.uuid4())[:8]
    tasks_db[compare_task_id] = {
        "task_id": compare_task_id,
        "task_type": "model_compare",
        "file_id": file_id,
        "class_name": class_name,
        "prompt": prompt,
        "model_ids": model_ids,
        "status": TaskStatus.PENDING.value,
        "progress": 0.0,
        "current_step": "queued",
        "message": f"已创建对比任务，{len(model_ids)} 个模型",
        "created_at": datetime.now().isoformat(),
        "result": None,
        "error": None,
    }
    save_tasks()
    background_tasks.add_task(
        _run_model_compare, compare_task_id, file_id, class_name, prompt, model_ids,
    )
    return {
        "compare_task_id": compare_task_id,
        "model_count": len(model_ids),
        "status_url": f"/api/tasks/{compare_task_id}",
    }


def _run_model_compare(
    compare_task_id: str,
    file_id: str,
    class_name: str,
    prompt: str,
    model_ids: List[str],
):
    """
    后台执行模型对比：对每个 model_id 在 file 上跑一次单类别分割，
    保存结果 mask 与基础统计（像素比例、推理耗时）。
    """
    import time
    import numpy as np
    from PIL import Image

    task = tasks_db[compare_task_id]
    file_info = uploaded_files[file_id]
    file_path = file_info["file_path"]

    output_dir = OUTPUT_DIR / "compare" / compare_task_id
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        task["status"] = TaskStatus.PROCESSING.value
        task["current_step"] = "loading_image"
        task["progress"] = 5.0
        save_tasks()

        # 读图（用现有 preview 流程的简化版）
        from backend.utils.geo_utils import create_preview_image
        img_array, _meta = create_preview_image(file_path, max_preview_size=1024)
        if img_array.ndim == 2:
            img_array = np.stack([img_array] * 3, axis=-1)
        if img_array.shape[-1] == 4:
            img_array = img_array[..., :3]
        img_array = img_array.astype(np.uint8)
        h, w = img_array.shape[:2]

        # 保存 base 图（用于前端显示）
        base_img_path = output_dir / "input.png"
        Image.fromarray(img_array).save(base_img_path)

        results = []

        for i, mid in enumerate(model_ids):
            task["current_step"] = f"running_{mid}"
            task["progress"] = 10.0 + (i / max(len(model_ids), 1)) * 80.0
            task["message"] = f"[{i+1}/{len(model_ids)}] 正在运行 {mid}..."
            save_tasks()

            t_start = time.time()
            try:
                mask, info = _run_single_model_for_compare(
                    img_array, class_name, prompt, mid,
                )
                elapsed = time.time() - t_start
                # 保存 mask
                mask_path = output_dir / f"mask_{mid}.png"
                # 上色：用红色叠加（统一颜色，仅展示分割结果）
                color_mask = np.zeros((h, w, 3), dtype=np.uint8)
                color_mask[mask > 0] = [255, 80, 80]
                Image.fromarray(color_mask).save(mask_path)

                fg_pixels = int((mask > 0).sum())
                ratio = fg_pixels / mask.size if mask.size > 0 else 0.0

                results.append({
                    "model_id": mid,
                    "display_name": info.get("display_name", mid),
                    "mask_url": f"/api/models/compare/{compare_task_id}/mask/{mid}",
                    "stats": {
                        "fg_pixels": fg_pixels,
                        "fg_ratio": round(ratio * 100, 2),
                        "elapsed_sec": round(elapsed, 2),
                    },
                    "info": info,
                    "status": "ok",
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                results.append({
                    "model_id": mid,
                    "status": "failed",
                    "error": str(e)[:300],
                    "elapsed_sec": round(time.time() - t_start, 2),
                })

        # 计算两两 IoU 矩阵（如果至少 2 个成功）
        ok_results = [r for r in results if r.get("status") == "ok"]
        iou_matrix = []
        if len(ok_results) >= 2:
            from PIL import Image as PILImage
            masks_bin = []
            for r in ok_results:
                m = np.array(PILImage.open(output_dir / f"mask_{r['model_id']}.png"))
                masks_bin.append((m[..., 0] > 0).astype(np.uint8))
            for i_a in range(len(ok_results)):
                row = []
                for i_b in range(len(ok_results)):
                    if i_a == i_b:
                        row.append(1.0)
                        continue
                    a, b = masks_bin[i_a], masks_bin[i_b]
                    inter = np.logical_and(a, b).sum()
                    union = np.logical_or(a, b).sum()
                    iou = float(inter / union) if union > 0 else 0.0
                    row.append(round(iou, 4))
                iou_matrix.append(row)

        task["status"] = TaskStatus.COMPLETED.value
        task["progress"] = 100.0
        task["current_step"] = "done"
        task["message"] = "对比完成"
        task["result"] = {
            "input_url": f"/api/models/compare/{compare_task_id}/input",
            "input_size": [w, h],
            "class_name": class_name,
            "prompt": prompt,
            "results": results,
            "iou_matrix": iou_matrix,
            "model_ids_for_iou": [r["model_id"] for r in ok_results],
        }
        save_tasks()
    except Exception as e:
        import traceback
        traceback.print_exc()
        task["status"] = TaskStatus.FAILED.value
        task["error"] = str(e)
        task["message"] = f"对比失败: {e}"
        save_tasks()


def _run_single_model_for_compare(
    img_array,
    class_name: str,
    prompt: str,
    model_id: str,
):
    """
    针对对比任务的单模型推理。返回 (binary_mask HxW uint8, info dict)。
    
    模型来源:
      - sam3_default / 用户上传 .pt → 走 SAM3Predictor + PRISM-A 单类别
      - mask2former_swin_l_ade / oneformer_swin_l_ade / upernet_convnext_s_ade
        / segformer_b5_ade → 走 HF transformers
      - dinov2_large → 不支持分割（特征模型），返回错误
    """
    import numpy as np
    from backend.services.pretrained_registry import (
        PRETRAINED_REGISTRY, is_hf_model_downloaded, download_pretrained,
    )

    # 用户上传的模型
    if model_id in user_models_db:
        return _compare_via_sam3(img_array, class_name, prompt, ckpt_path=user_models_db[model_id]["file_path"])

    entry = PRETRAINED_REGISTRY.get(model_id)
    if not entry:
        # 回退: 试用户模型 / sam3 default
        return _compare_via_sam3(img_array, class_name, prompt, ckpt_path=None)

    family = entry.get("family")
    if family == "sam":
        return _compare_via_sam3(img_array, class_name, prompt, ckpt_path=None)
    elif family == "dinov2":
        raise RuntimeError(
            "DINOv2 是视觉骨干网络（特征提取），不支持端到端分割对比。请改选 Mask2Former / SegFormer / OneFormer / SAM3。"
        )

    # HF 系列：mask2former / segformer / oneformer / upernet
    repo = entry.get("hf_repo")
    if not repo:
        raise RuntimeError(f"模型 {model_id} 无 HF repo 配置")
    if not is_hf_model_downloaded(repo):
        # 自动下载
        download_pretrained(model_id)

    # ===== 复用 hf_refine_service 的推理函数 =====
    from backend.services.hf_refine_service import (
        _load_mask2former, _load_segformer, _infer_semantic_seg,
        KEYWORD_TO_ADE_INDICES,
    )
    import torch

    text = (class_name + " " + (prompt or "")).lower()
    ade_indices = []
    for kw, idxs in KEYWORD_TO_ADE_INDICES.items():
        if kw in text:
            for ix in idxs:
                if ix not in ade_indices:
                    ade_indices.append(ix)
    if not ade_indices:
        # 全部 ADE 类全索引（作为兜底，会几乎全选 → 提示用户类别词不通用）
        raise RuntimeError(f"类别 \"{class_name}\" 无法映射到 ADE20K 词表，请改用 SAM3（开放词汇）")

    if family in ("mask2former", "oneformer"):
        # OneFormer 用 Mask2Former 同款 processor + post_process（兼容）
        loaded = _load_mask2former(repo)
    elif family == "segformer":
        loaded = _load_segformer(repo)
    elif family == "upernet":
        # UperNet 输出格式与 SegFormer 类似，复用 SegFormer loader
        try:
            loaded = _load_segformer(repo)
        except Exception:
            raise RuntimeError(f"UperNet 加载失败: {repo}（当前 wrapper 仅支持 SegFormer / Mask2Former / OneFormer 风格）")
    else:
        raise RuntimeError(f"未支持的模型家族: {family}")

    # _infer_semantic_seg 返回 HxW 的 class id 数组（已 argmax）
    seg_map = _infer_semantic_seg(loaded, img_array)
    # 提取目标 ADE20K 索引为二值 mask
    binary = np.isin(seg_map, ade_indices).astype(np.uint8)

    info = {
        "display_name": entry.get("display_name", model_id),
        "family": family,
        "backbone": entry.get("backbone"),
        "ade_indices": ade_indices,
        "params": entry.get("params"),
    }
    return binary, info


def _compare_via_sam3(img_array, class_name: str, prompt: str, ckpt_path=None):
    """
    用 SAM3 + PRISM-A 单类别推理，返回 binary mask。
    ckpt_path=None 用默认 weights/sam3.pt；否则用用户上传权重。
    """
    import numpy as np
    from PIL import Image
    from backend.config import MODEL_CONFIG, SEGEARTH_STRATEGY
    from backend.core.predictor import get_predictor

    actual_ckpt = ckpt_path or MODEL_CONFIG["checkpoint_path"]
    predictor = get_predictor(
        bpe_path=MODEL_CONFIG["bpe_path"],
        checkpoint_path=actual_ckpt,
        device=MODEL_CONFIG.get("device", "cuda"),
        confidence_threshold=MODEL_CONFIG.get("confidence_threshold", 0.1),
    )

    # 用户上传的可能不是 SAM3 兼容；上面 upload 已经验证过架构
    classes = ["background", class_name]
    prompts = {class_name: prompt}
    h, w = img_array.shape[:2]
    invalid_mask = np.zeros((h, w), dtype=bool)

    prediction, _ps = predictor.predict_full_image(
        img_np=img_array,
        invalid_mask=invalid_mask,
        classes=classes,
        prompts=prompts,
        crop_size=512,
        stride=384,
        use_sem_seg=True,
        use_transformer_decoder=True,
        use_presence_score=True,
        prob_thd=SEGEARTH_STRATEGY.get("prob_thd", 0.4),
        bg_idx=0,
    )
    binary = (prediction == 1).astype(np.uint8)
    info = {
        "display_name": "SAM3 (用户权重)" if ckpt_path else "SAM3 (默认)",
        "family": "sam",
        "backbone": "ViT-H",
        "params": "636M",
        "strategy": "PRISM-A single class",
    }
    return binary, info


@router.get("/models/compare/{compare_task_id}/input")
async def get_compare_input(compare_task_id: str):
    """获取对比任务的输入图"""
    p = OUTPUT_DIR / "compare" / compare_task_id / "input.png"
    if not p.exists():
        raise HTTPException(status_code=404, detail="输入图不存在")
    return FileResponse(str(p), media_type="image/png")


@router.get("/models/compare/{compare_task_id}/mask/{model_id}")
async def get_compare_mask(compare_task_id: str, model_id: str):
    """获取对比任务中某个模型的输出 mask"""
    p = OUTPUT_DIR / "compare" / compare_task_id / f"mask_{model_id}.png"
    if not p.exists():
        raise HTTPException(status_code=404, detail="mask 不存在")
    return FileResponse(str(p), media_type="image/png")


# ============================================================
# AI 视觉诊断与修正 API — GPT 视觉大模型分析分割结果
# ============================================================

@router.post("/ai-diagnose/{task_id}")
async def ai_diagnose_segmentation(task_id: str):
    """
    使用 GPT 视觉模型对预测结果进行整体质量诊断，返回结构化报告。
    """
    from backend.services.ai_correction_service import diagnose

    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks_db[task_id]
    if task.get("status") != TaskStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="任务尚未完成")
    result = task.get("result")
    if not result:
        raise HTTPException(status_code=404, detail="预测结果不存在")

    original_path = result.get("original_path")
    color_mask_path = result.get("color_mask_path")
    raw_mask_path = result.get("edited_mask_path") or result.get("mask_path")  # 优先用编辑后的
    classes = result.get("classes", [])
    palette = result.get("palette", [])

    if not original_path or not color_mask_path:
        raise HTTPException(status_code=404, detail="原图或彩色 mask 路径丢失")
    if not os.path.exists(original_path):
        raise HTTPException(status_code=404, detail=f"原图不存在: {original_path}")
    if not os.path.exists(color_mask_path):
        raise HTTPException(status_code=404, detail=f"彩色 mask 不存在: {color_mask_path}")

    # 收集当前 prompts（从父任务的 classes 字段，如果可用）
    current_prompts = None
    parent_classes = task.get("classes", [])
    if isinstance(parent_classes, list) and parent_classes and isinstance(parent_classes[0], dict):
        current_prompts = {c["name"]: c.get("prompt", "") for c in parent_classes if "name" in c}

    try:
        report = await diagnose(
            original_path=original_path,
            color_mask_path=color_mask_path,
            classes=classes,
            palette=palette,
            current_prompts=current_prompts,
            mask_path=raw_mask_path,  # 让 diagnose 用原始 mask 算每类像素占比
        )
        # 写入任务历史
        history = task["result"].setdefault("ai_diagnose_history", [])
        history.append({
            "at": datetime.now().isoformat(),
            "model": report.get("model"),
            "overall_quality": report["diagnosis"].get("overall_quality"),
            "overall_score": report["diagnosis"].get("overall_score"),
            "summary": report["diagnosis"].get("summary"),
        })
        save_tasks()
        return report
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        # 安全打印：万一 stdout 仍是 GBK，避免 print 自身再次抛出 UnicodeEncodeError 把 500 变成更糟的崩溃
        try:
            print(f"[AI Diagnose] 错误: {e}\n{trace}")
        except UnicodeEncodeError:
            safe_msg = (f"[AI Diagnose] 错误: {e}\n{trace}").encode("utf-8", "replace").decode("ascii", "replace")
            print(safe_msg)
        # 同样要把 detail 字符串里可能的非 GBK 字符（如 ⚠️）保留为 UTF-8 给前端，FastAPI/JSON 是 UTF-8 安全的
        raise HTTPException(status_code=500, detail=f"AI 诊断失败: {e}")


@router.post("/ai-rerun/{task_id}")
async def ai_rerun_with_prompts(task_id: str, request: dict, background_tasks: BackgroundTasks):
    """
    根据 AI 建议的提示词重新运行预测。
    Body:
      - new_prompts: {class_name: english_prompt} （仅替换被改的类别，未提及的保持原值）
      - additional_classes: [{"name": "...", "prompt": "...", "color": [r,g,b]}]（可选，新增缺失类别）
    """
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="任务不存在")
    task = tasks_db[task_id]
    file_id = task.get("file_id")
    if not file_id or file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="原始上传文件不存在")

    new_prompts = request.get("new_prompts", {})
    additional_classes = request.get("additional_classes", [])

    parent_classes = task.get("classes") or []
    if not isinstance(parent_classes, list) or not parent_classes:
        raise HTTPException(status_code=400, detail="父任务无类别配置，无法重运行")

    # 构造新类别配置：覆盖原 prompts，再追加新类别
    updated_classes = []
    for c in parent_classes:
        if not isinstance(c, dict):
            continue
        new_c = dict(c)
        if c.get("name") in new_prompts:
            new_c["prompt"] = new_prompts[c["name"]]
        updated_classes.append(new_c)

    used_colors = {tuple(c.get("color", [0, 0, 0])) for c in updated_classes}
    fallback_palette = [
        [255, 165, 0], [128, 0, 128], [0, 200, 200], [200, 0, 100], [100, 200, 0],
        [255, 100, 200], [50, 100, 255], [200, 200, 50],
    ]
    fb_idx = 0
    for nc in additional_classes:
        if not isinstance(nc, dict) or "name" not in nc:
            continue
        if any(c.get("name") == nc["name"] for c in updated_classes):
            continue
        if "color" not in nc or not nc["color"]:
            while fb_idx < len(fallback_palette) and tuple(fallback_palette[fb_idx]) in used_colors:
                fb_idx += 1
            nc["color"] = fallback_palette[fb_idx % len(fallback_palette)]
            fb_idx += 1
        updated_classes.append(nc)

    # 用 predict-single 的复用逻辑：创建新任务
    new_task_id = str(uuid.uuid4())[:8]
    file_info = uploaded_files[file_id]
    tasks_db[new_task_id] = {
        "task_id": new_task_id,
        "file_id": file_id,
        "task_type": "single_predict",
        "classes": updated_classes,
        "model_id": "default",
        "status": TaskStatus.PENDING.value,
        "progress": 0.0,
        "current_step": "queued",
        "message": "AI 优化预测任务已创建",
        "created_at": datetime.now().isoformat(),
        "parent_task_id": task_id,
        "ai_optimized": True,
        "result": None,
        "error": None,
    }
    save_tasks()
    background_tasks.add_task(run_single_prediction, new_task_id, file_info, updated_classes, None)

    return {
        "new_task_id": new_task_id,
        "parent_task_id": task_id,
        "applied_prompts": new_prompts,
        "added_classes": [c["name"] for c in additional_classes if "name" in c],
        "total_classes": len(updated_classes),
    }


# ============================================================
# AI 聊天助手 API — 接入 OpenAI 兼容 LLM
# ============================================================

CHAT_API_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
CHAT_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
CHAT_MODEL = os.environ.get("CHAT_MODEL", "gpt-4o-mini")

# 可供 AI 助手切换的模型列表（前端下拉显示）
AVAILABLE_CHAT_MODELS = [
    {
        "id": "gpt-5.5",
        "name": "GPT-5.5",
        "tier": "Standard",
        "desc": "标准版，平衡速度与质量，日常对话首选",
        "max_tokens": 1024,
        "supports_vision": True,
    },
    {
        "id": "gpt-5.5-pro",
        "name": "GPT-5.5 Pro",
        "tier": "Pro",
        "desc": "深度推理，复杂分析与代码任务最佳，响应较慢",
        "max_tokens": 2048,
        "supports_vision": True,
    },
    {
        "id": "gpt-5.5-mini",
        "name": "GPT-5.5 Mini",
        "tier": "Fast",
        "desc": "轻量极速版，适合短问答与导航指令",
        "max_tokens": 512,
        "supports_vision": False,
    },
    {
        "id": "gpt-5.5-vision",
        "name": "GPT-5.5 Vision",
        "tier": "Vision",
        "desc": "视觉多模态版，可分析图像（截图、影像、mask 等）",
        "max_tokens": 1024,
        "supports_vision": True,
    },
]
CHAT_SYSTEM_PROMPT = """你是 RS Dataset Factory（遥感数据集智能制作平台）的 AI 助手。你需要帮助用户使用本系统的各项功能。

系统功能概览：
1. **数据集制作**（/dataset）：上传遥感图像 → 配置语义类别和提示词 → SAM3 模型自动预测分割 → 交互式标注编辑 → 导出标准数据集 ZIP
2. **数据预处理**（/preprocess）：图像增强（直方图均衡化、对比度调整、锐化、去噪）和格式转换（PNG/JPG/GeoTIFF）
3. **下游任务**（/tasks）：YOLOv8-OBB 遥感目标检测、TTST 遥感超分辨率、Canny 边缘提取、暗通道去雾、双时相变化检测
4. **模型管理**（/models）：上传自定义 SAM3 兼容的 PyTorch 权重文件，在预测时选择使用

技术细节：
- 分割模型：SAM3（Segment Anything Model 3），支持开放词汇语义分割，通过文字提示词指定目标类别
- 支持格式：GeoTIFF、PNG、JPG、HDF、NetCDF 等
- GPU 加速：支持 NVIDIA GPU（CUDA）进行推理加速

回答要求：
- 简洁、准确、友好
- 如果用户问的问题与系统功能有关，给出具体操作步骤
- 如果用户想导航到某个功能，告知对应的页面路径
- 用中文回答"""


@router.get("/chat/models")
async def list_chat_models():
    """前端 AI 助手用：列出可切换的 GPT-5.5 系列模型"""
    return {
        "default": CHAT_MODEL,
        "models": AVAILABLE_CHAT_MODELS,
    }


@router.post("/chat")
async def chat_with_ai(request: dict):
    """AI 聊天助手 — 调用 LLM API（支持 model 参数切换 GPT-5.5 系列）"""
    import httpx

    user_messages = request.get("messages", [])
    if not user_messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    # 用户可在请求体里指定 model；否则用默认 CHAT_MODEL
    requested_model = (request.get("model") or "").strip() or CHAT_MODEL
    # 校验是否在白名单内（避免随意调用未知模型）
    valid_ids = {m["id"] for m in AVAILABLE_CHAT_MODELS}
    model_to_use = requested_model if requested_model in valid_ids else CHAT_MODEL
    # 找出这个模型的元数据（用于 max_tokens 等）
    model_meta = next((m for m in AVAILABLE_CHAT_MODELS if m["id"] == model_to_use), AVAILABLE_CHAT_MODELS[0])
    max_tokens = int(request.get("max_tokens") or model_meta.get("max_tokens", 1024))
    temperature = float(request.get("temperature") or 0.7)

    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    for msg in user_messages[-20:]:
        messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{CHAT_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {CHAT_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_to_use,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            # 如果上游 API 返回的 model 字段（如带版本号）则透传给前端
            actual_model = data.get("model", model_to_use)
            usage = data.get("usage") or {}
            return {
                "reply": reply,
                "model": actual_model,
                "requested_model": model_to_use,
                "model_tier": model_meta.get("tier"),
                "usage": {
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                },
            }
    except httpx.TimeoutException:
        return {"reply": "抱歉，AI 服务响应超时，请稍后重试。", "model": model_to_use, "error": "timeout"}
    except Exception as e:
        print(f"[Chat API] Error: {e}")
        return {"reply": f"AI 服务暂时不可用，请稍后重试。({str(e)[:100]})", "model": model_to_use, "error": str(e)}
