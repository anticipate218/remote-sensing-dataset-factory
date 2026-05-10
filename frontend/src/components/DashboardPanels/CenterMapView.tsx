import React, { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, Rectangle, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../stores/appStore'

const SAMPLE_SITES = [
  { lat: 30.55, lng: 114.35, name: '武汉 · 城市建筑', type: '语义分割', classes: 6, images: 2400, mIoU: 0.823, color: '#74f7fd' },
  { lat: 39.92, lng: 116.40, name: '北京 · 道路网络', type: '目标检测', classes: 4, images: 1800, mIoU: 0.791, color: '#74fabd' },
  { lat: 31.23, lng: 121.47, name: '上海 · 港口设施', type: '变化检测', classes: 3, images: 960, mIoU: 0.856, color: '#5bc7fa' },
  { lat: 23.13, lng: 113.26, name: '广州 · 植被覆盖', type: '语义分割', classes: 8, images: 3200, mIoU: 0.878, color: '#f0c040' },
  { lat: 34.27, lng: 108.94, name: '西安 · 历史遗迹', type: '超分辨率', classes: 5, images: 640, mIoU: 0.745, color: '#ff6b6b' },
  { lat: 25.04, lng: 102.73, name: '昆明 · 农田监测', type: '语义分割', classes: 7, images: 1600, mIoU: 0.812, color: '#74f7fd' },
  { lat: 43.83, lng: 87.62, name: '乌鲁木齐 · 荒漠', type: '变化检测', classes: 3, images: 480, mIoU: 0.768, color: '#5bc7fa' },
  { lat: 36.07, lng: 120.38, name: '青岛 · 海岸线', type: '边缘检测', classes: 4, images: 1200, mIoU: 0.834, color: '#74fabd' },
]

const DATA_FLOWS = [
  { from: [30.55, 114.35], to: [39.92, 116.40] },
  { from: [31.23, 121.47], to: [23.13, 113.26] },
  { from: [34.27, 108.94], to: [25.04, 102.73] },
  { from: [36.07, 120.38], to: [31.23, 121.47] },
]

const CRS_INFO = {
  epsg: 'EPSG:4326',
  datum: 'WGS 84',
  proj: 'Geographic',
  unit: 'degree',
}

const SPECTRAL_BANDS = [
  { name: 'B2', label: 'Blue', range: '450-520nm', color: '#4488ff' },
  { name: 'B3', label: 'Green', range: '520-600nm', color: '#44cc44' },
  { name: 'B4', label: 'Red', range: '630-690nm', color: '#ff4444' },
  { name: 'B8', label: 'NIR', range: '760-900nm', color: '#cc4488' },
]

function CoordinateTracker({ onMove }: { onMove: (lat: number, lng: number, zoom: number) => void }) {
  const map = useMapEvents({
    mousemove: (e) => {
      onMove(e.latlng.lat, e.latlng.lng, map.getZoom())
    },
    zoomend: () => {
      const center = map.getCenter()
      onMove(center.lat, center.lng, map.getZoom())
    },
  })
  return null
}

// AOI 拖曳画框：监听 mousedown / mousemove / mouseup，期间临时禁用地图拖动
interface AOIBounds {
  north: number; south: number; east: number; west: number;
}

function AOIDrawer({
  enabled,
  onComplete,
}: {
  enabled: boolean
  onComplete: (b: AOIBounds) => void
}) {
  const map = useMap()
  const [start, setStart] = useState<L.LatLng | null>(null)
  const [end, setEnd] = useState<L.LatLng | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      map.dragging.enable()
      setStart(null)
      setEnd(null)
      return
    }
    map.dragging.disable()
    map.getContainer().style.cursor = 'crosshair'
    const onDown = (e: L.LeafletMouseEvent) => {
      draggingRef.current = true
      setStart(e.latlng)
      setEnd(e.latlng)
    }
    const onMove = (e: L.LeafletMouseEvent) => {
      if (!draggingRef.current) return
      setEnd(e.latlng)
    }
    const onUp = (e: L.LeafletMouseEvent) => {
      if (!draggingRef.current || !start) return
      draggingRef.current = false
      const a = start
      const b = e.latlng
      const bounds: AOIBounds = {
        north: Math.max(a.lat, b.lat),
        south: Math.min(a.lat, b.lat),
        east: Math.max(a.lng, b.lng),
        west: Math.min(a.lng, b.lng),
      }
      // 太小的框忽略（避免误触）
      if (Math.abs(bounds.north - bounds.south) < 0.001 || Math.abs(bounds.east - bounds.west) < 0.001) {
        setStart(null); setEnd(null)
        return
      }
      onComplete(bounds)
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    return () => {
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
      map.getContainer().style.cursor = ''
      map.dragging.enable()
    }
  }, [enabled, map, start, onComplete])

  if (!enabled || !start || !end) return null
  const rectBounds: L.LatLngBoundsExpression = [
    [Math.min(start.lat, end.lat), Math.min(start.lng, end.lng)],
    [Math.max(start.lat, end.lat), Math.max(start.lng, end.lng)],
  ]
  return (
    <Rectangle
      bounds={rectBounds}
      pathOptions={{
        color: '#74f7fd',
        weight: 2,
        fillColor: '#74f7fd',
        fillOpacity: 0.18,
        dashArray: '6 4',
      }}
    />
  )
}

function createSiteIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 12px; height: 12px;
        background: ${color};
        border: 2px solid rgba(255,255,255,0.8);
        border-radius: 50%;
        box-shadow: 0 0 8px ${color}, 0 0 16px ${color}44;
        position: relative;
      ">
        <div style="
          position: absolute; inset: -6px;
          border: 1px solid ${color}44;
          border-radius: 50%;
          animation: sitePulse 2s ease-in-out infinite;
        "></div>
      </div>
    `,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

const CenterMapView: React.FC = () => {
  const [cursor, setCursor] = useState({ lat: 30.55, lng: 114.35, zoom: 5 })
  const [activeSite, setActiveSite] = useState<typeof SAMPLE_SITES[0] | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [pendingAOI, setPendingAOI] = useState<AOIBounds | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureProgress, setCaptureProgress] = useState('')
  const navigate = useNavigate()
  const { setUploadedFile, setCurrentStep, markStepCompleted } = useAppStore()

  const handleMove = useCallback((lat: number, lng: number, zoom: number) => {
    setCursor({ lat, lng, zoom })
  }, [])

  const handleAOIComplete = useCallback((b: AOIBounds) => {
    setPendingAOI(b)
    setDrawMode(false)
  }, [])

  const captureAOI = useCallback(async (bounds: AOIBounds, siteName?: string) => {
    setCapturing(true)
    setCaptureProgress('正在抓取卫星瓦片...')
    try {
      // 自动按区域大小选择 zoom：跨度越小 zoom 越大
      const span = Math.max(bounds.north - bounds.south, bounds.east - bounds.west)
      const autoZoom = span > 1.0 ? 10
        : span > 0.3 ? 12
        : span > 0.08 ? 14
        : span > 0.02 ? 16
        : 17
      const r = await axios.post('/api/aoi/capture', {
        ...bounds,
        zoom: autoZoom,
        site_name: siteName || `AOI_${cursor.lat.toFixed(2)}_${cursor.lng.toFixed(2)}`,
      }, { timeout: 90000 })
      setCaptureProgress('正在处理...')
      const data = r.data
      // 同步到 zustand：UploadedFile 形态需要包含 task_id
      setUploadedFile({
        task_id: data.file_id,
        file_id: data.file_id,
        filename: data.filename,
        file_size: data.file_size,
        width: data.width,
        height: data.height,
        bands: data.bands,
        preview_url: data.preview_url,
        metadata: data.metadata,
      } as any)
      markStepCompleted('upload')
      setCurrentStep('configure')
      message.success(`已捕获 AOI（${data.width}×${data.height}px），即将进入数据集配置`)
      setPendingAOI(null)
      setTimeout(() => navigate('/dataset'), 200)
    } catch (e: any) {
      message.error(`AOI 捕获失败：${e?.response?.data?.detail || e?.message || '未知错误'}`)
    } finally {
      setCapturing(false)
      setCaptureProgress('')
    }
  }, [cursor.lat, cursor.lng, navigate, setUploadedFile, setCurrentStep, markStepCompleted])

  // 从示范点直接生成 AOI（围绕该点取一个固定大小区域）
  const captureFromSite = useCallback((site: typeof SAMPLE_SITES[0]) => {
    const halfDeg = 0.025  // ~ 5km × 5km @ 中纬度
    const bounds: AOIBounds = {
      north: site.lat + halfDeg,
      south: site.lat - halfDeg,
      east: site.lng + halfDeg,
      west: site.lng - halfDeg,
    }
    captureAOI(bounds, site.name)
  }, [captureAOI])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Leaflet Map */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <MapContainer
          center={[33, 108]}
          zoom={5}
          minZoom={3}
          maxZoom={18}
          zoomControl={false}
          attributionControl={false}
          style={{ width: '100%', height: '100%', background: '#020e1f' }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          {/* dark overlay to blend with theme */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
            opacity={0.7}
          />

          <CoordinateTracker onMove={handleMove} />
          <AOIDrawer enabled={drawMode} onComplete={handleAOIComplete} />

          {/* 已确认的 AOI 矩形保持显示，便于用户对照确认 */}
          {pendingAOI && (
            <Rectangle
              bounds={[
                [pendingAOI.south, pendingAOI.west],
                [pendingAOI.north, pendingAOI.east],
              ]}
              pathOptions={{
                color: '#74fabd',
                weight: 2,
                fillColor: '#74fabd',
                fillOpacity: 0.12,
                dashArray: '4 4',
              }}
            />
          )}

          {SAMPLE_SITES.map((site) => (
            <React.Fragment key={site.name}>
              <CircleMarker
                center={[site.lat, site.lng]}
                radius={28}
                pathOptions={{
                  color: site.color,
                  weight: 1,
                  opacity: 0.2,
                  fillColor: site.color,
                  fillOpacity: 0.05,
                }}
              />
              <Marker
                position={[site.lat, site.lng]}
                icon={createSiteIcon(site.color)}
                eventHandlers={{
                  click: () => setActiveSite(site),
                  mouseover: () => setActiveSite(site),
                }}
              >
                <Popup>
                  <div style={{
                    background: 'rgba(2, 14, 31, 0.95)',
                    border: '1px solid rgba(116, 247, 253, 0.3)',
                    borderRadius: 8,
                    padding: 12,
                    minWidth: 200,
                    color: '#fff',
                    fontFamily: "'SarasaMonoSC', monospace",
                  }}>
                    <div style={{ fontFamily: "'DouyuFont'", fontSize: 13, color: '#74f7fd', marginBottom: 8 }}>
                      {site.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
                      <span style={{ color: '#b9cfff' }}>Task</span>
                      <span style={{ color: site.color }}>{site.type}</span>
                      <span style={{ color: '#b9cfff' }}>Classes</span>
                      <span style={{ color: '#fff' }}>{site.classes}</span>
                      <span style={{ color: '#b9cfff' }}>Samples</span>
                      <span style={{ fontFamily: "'DincorosBlack'", color: '#fff' }}>{site.images.toLocaleString()}</span>
                      <span style={{ color: '#b9cfff' }}>mIoU</span>
                      <span style={{ fontFamily: "'DincorosBlack'", color: '#74fabd' }}>{site.mIoU.toFixed(3)}</span>
                    </div>
                    <button
                      onClick={() => captureFromSite(site)}
                      disabled={capturing}
                      style={{
                        marginTop: 10, width: '100%',
                        padding: '6px 10px',
                        background: capturing ? 'rgba(116,247,253,0.06)' : 'linear-gradient(135deg, rgba(116,247,253,0.18), rgba(91,199,250,0.18))',
                        border: '1px solid rgba(116,247,253,0.45)',
                        borderRadius: 6,
                        color: '#74f7fd',
                        cursor: capturing ? 'not-allowed' : 'pointer',
                        fontFamily: "'SarasaMonoSC', monospace",
                        fontSize: 11,
                      }}
                    >
                      ▶ {capturing ? '抓取中...' : '用此区域制作数据集'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}

          {DATA_FLOWS.map((flow, i) => (
            <Polyline
              key={i}
              positions={[
                [flow.from[0], flow.from[1]],
                [flow.to[0], flow.to[1]],
              ]}
              pathOptions={{ color: '#74f7fd', weight: 1, opacity: 0.08, dashArray: '4 4' }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Dark vignette overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 85% 75% at center, transparent 10%, rgba(2,14,31,0.3) 45%, rgba(2,14,31,0.75) 100%),
          linear-gradient(180deg, rgba(2,14,31,0.6) 0%, transparent 8%, transparent 92%, rgba(2,14,31,0.6) 100%)
        `,
      }} />

      {/* Academic HUD Overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
        fontFamily: "'SarasaMonoSC', 'JetBrains Mono', monospace",
      }}>
        {/* Coordinate Readout - bottom left */}
        <div style={{
          position: 'absolute',
          bottom: 86,
          left: 440,
          background: 'rgba(2, 14, 31, 0.85)',
          border: '1px solid rgba(116, 247, 253, 0.2)',
          borderRadius: 6,
          padding: '8px 14px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: '#5bc7fa', letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' }}>
            Cursor Position
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>Lat </span>
              <span style={{ fontFamily: "'DincorosBlack'", color: '#74f7fd' }}>{cursor.lat.toFixed(4)}°</span>
            </span>
            <span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>Lng </span>
              <span style={{ fontFamily: "'DincorosBlack'", color: '#74f7fd' }}>{cursor.lng.toFixed(4)}°</span>
            </span>
            <span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>Z </span>
              <span style={{ fontFamily: "'DincorosBlack'", color: '#74fabd' }}>{cursor.zoom}</span>
            </span>
          </div>
        </div>

        {/* CRS Info - bottom right */}
        <div style={{
          position: 'absolute',
          bottom: 86,
          right: 440,
          background: 'rgba(2, 14, 31, 0.85)',
          border: '1px solid rgba(116, 247, 253, 0.15)',
          borderRadius: 6,
          padding: '8px 14px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: 9, color: '#5bc7fa', letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' }}>
            Reference System
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 11 }}>
            <span style={{ color: '#b9cfff', opacity: 0.6 }}>CRS</span>
            <span style={{ fontFamily: "'DincorosBlack'", color: '#74f7fd' }}>{CRS_INFO.epsg}</span>
            <span style={{ color: '#b9cfff', opacity: 0.6 }}>Datum</span>
            <span style={{ color: '#fff' }}>{CRS_INFO.datum}</span>
          </div>
        </div>

        {/* Spectral Band Indicator - top center */}
        <div style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          background: 'rgba(2, 14, 31, 0.8)',
          border: '1px solid rgba(116, 247, 253, 0.15)',
          borderRadius: 20,
          padding: '5px 16px',
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{ fontSize: 9, color: '#b9cfff', opacity: 0.5, letterSpacing: 1, display: 'flex', alignItems: 'center', marginRight: 4 }}>
            BANDS
          </span>
          {SPECTRAL_BANDS.map((band) => (
            <div key={band.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: 2,
                background: band.color,
                boxShadow: `0 0 4px ${band.color}66`,
              }} />
              <span style={{ fontSize: 10, color: '#b9cfff' }}>{band.name}</span>
            </div>
          ))}
        </div>

        {/* Active Site Info - floating card */}
        {activeSite && (
          <div style={{
            position: 'absolute',
            top: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(2, 14, 31, 0.9)',
            border: '1px solid rgba(116, 247, 253, 0.25)',
            borderRadius: 8,
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            backdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div>
              <div style={{ fontFamily: "'DouyuFont'", fontSize: 12, color: activeSite.color }}>
                {activeSite.name}
              </div>
              <div style={{ fontSize: 10, color: '#b9cfff', opacity: 0.6 }}>{activeSite.type}</div>
            </div>
            <div style={{ width: 1, height: 28, background: 'rgba(116,247,253,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'DincorosBlack'", fontSize: 18, color: '#74fabd' }}>{activeSite.mIoU.toFixed(3)}</div>
              <div style={{ fontSize: 9, color: '#b9cfff', opacity: 0.5 }}>mIoU</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'DincorosBlack'", fontSize: 18, color: '#74f7fd' }}>{activeSite.images.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: '#b9cfff', opacity: 0.5 }}>Samples</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'DincorosBlack'", fontSize: 18, color: '#5bc7fa' }}>{activeSite.classes}</div>
              <div style={{ fontSize: 9, color: '#b9cfff', opacity: 0.5 }}>Classes</div>
            </div>
          </div>
        )}

        {/* AOI Toolbar - top left */}
        <div style={{
          position: 'absolute',
          top: 56,
          left: 440,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'auto',
        }}>
          <button
            onClick={() => setDrawMode((v) => !v)}
            disabled={capturing}
            title="在地图上拖曳画矩形框，框定的区域将被抓取为遥感影像"
            style={{
              padding: '8px 14px',
              background: drawMode
                ? 'linear-gradient(135deg, rgba(116,250,189,0.25), rgba(116,247,253,0.2))'
                : 'rgba(2, 14, 31, 0.85)',
              border: `1px solid ${drawMode ? 'rgba(116,250,189,0.6)' : 'rgba(116,247,253,0.3)'}`,
              borderRadius: 8,
              color: drawMode ? '#74fabd' : '#74f7fd',
              cursor: capturing ? 'not-allowed' : 'pointer',
              fontFamily: "'DouyuFont', sans-serif",
              fontSize: 12,
              letterSpacing: 1,
              backdropFilter: 'blur(8px)',
              boxShadow: drawMode ? '0 0 12px rgba(116,250,189,0.35)' : 'none',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className={drawMode ? 'fa-solid fa-vector-square' : 'fa-solid fa-draw-polygon'} />
            {drawMode ? '取消画框' : '画框创建数据集'}
          </button>
          {drawMode && (
            <div style={{
              padding: '6px 12px',
              background: 'rgba(2, 14, 31, 0.9)',
              border: '1px dashed rgba(116,250,189,0.45)',
              borderRadius: 6,
              fontSize: 10,
              color: 'rgba(116,250,189,0.9)',
              fontFamily: "'Source Serif 4', serif",
              fontStyle: 'italic',
              maxWidth: 220,
              lineHeight: 1.5,
            }}>
              在地图上按住鼠标 + 拖曳，框选要捕获的地理区域
            </div>
          )}
        </div>

        {/* AOI 确认对话框 - 居中浮窗 */}
        {pendingAOI && !capturing && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(2, 14, 31, 0.96)',
            border: '1px solid rgba(116, 247, 253, 0.4)',
            borderRadius: 12,
            padding: '20px 24px',
            minWidth: 340,
            backdropFilter: 'blur(12px)',
            boxShadow: '0 12px 60px rgba(0,0,0,0.6), 0 0 30px rgba(116,247,253,0.15)',
            pointerEvents: 'auto',
            fontFamily: "'SarasaMonoSC', monospace",
          }}>
            <div style={{
              fontFamily: "'DouyuFont'", fontSize: 14, color: '#74fabd',
              marginBottom: 12, letterSpacing: 1.5,
            }}>
              ▶ 确认捕获该区域
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 11, marginBottom: 16 }}>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>North</span>
              <span style={{ color: '#74f7fd', fontFamily: "'DincorosBlack'" }}>{pendingAOI.north.toFixed(4)}°</span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>South</span>
              <span style={{ color: '#74f7fd', fontFamily: "'DincorosBlack'" }}>{pendingAOI.south.toFixed(4)}°</span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>West</span>
              <span style={{ color: '#74f7fd', fontFamily: "'DincorosBlack'" }}>{pendingAOI.west.toFixed(4)}°</span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>East</span>
              <span style={{ color: '#74f7fd', fontFamily: "'DincorosBlack'" }}>{pendingAOI.east.toFixed(4)}°</span>
              <span style={{ color: '#b9cfff', opacity: 0.6 }}>Span</span>
              <span style={{ color: '#fff' }}>
                ~{((pendingAOI.north - pendingAOI.south) * 111).toFixed(1)} × {((pendingAOI.east - pendingAOI.west) * 111 * Math.cos(((pendingAOI.north + pendingAOI.south) / 2) * Math.PI / 180)).toFixed(1)} km
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#b9cfff', opacity: 0.55, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', marginBottom: 14 }}>
              系统将抓取该区域 ArcGIS 卫星影像，并自动创建一份数据集任务
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setPendingAOI(null)}
                style={{
                  flex: 1, padding: '8px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6, color: '#b9cfff', cursor: 'pointer',
                  fontFamily: "'SarasaMonoSC', monospace", fontSize: 12,
                }}
              >
                取消
              </button>
              <button
                onClick={() => captureAOI(pendingAOI)}
                style={{
                  flex: 2, padding: '8px 12px',
                  background: 'linear-gradient(135deg, #74f7fd, #5bc7fa)',
                  border: 'none', borderRadius: 6,
                  color: '#02060f', cursor: 'pointer',
                  fontFamily: "'DouyuFont'", fontSize: 12, letterSpacing: 1,
                  fontWeight: 600,
                }}
              >
                ▶ 开始捕获
              </button>
            </div>
          </div>
        )}

        {/* 抓取中遮罩 */}
        {capturing && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(2, 14, 31, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 14,
            zIndex: 50,
            pointerEvents: 'auto',
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: '50%',
              border: '3px solid rgba(116,247,253,0.2)',
              borderTopColor: '#74f7fd',
              animation: 'aoiSpin 1s linear infinite',
            }} />
            <div style={{ color: '#74f7fd', fontFamily: "'DouyuFont'", fontSize: 14, letterSpacing: 1.5 }}>
              {captureProgress || '正在捕获 AOI 区域...'}
            </div>
            <div style={{ color: '#b9cfff', opacity: 0.6, fontSize: 11, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic' }}>
              正在从 ArcGIS World Imagery 下载并拼接卫星瓦片
            </div>
          </div>
        )}

        {/* Scale bar approximation */}
        <div style={{
          position: 'absolute',
          bottom: 86,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}>
          <div style={{ width: 80, height: 1, background: 'rgba(255,255,255,0.4)' }}>
            <div style={{ width: 1, height: 4, background: 'rgba(255,255,255,0.4)', position: 'relative', top: -2 }} />
            <div style={{ width: 1, height: 4, background: 'rgba(255,255,255,0.4)', position: 'relative', top: -5, left: 79 }} />
          </div>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
            ~{Math.round(500 / Math.pow(2, cursor.zoom - 5))} km
          </span>
        </div>
      </div>

      {/* Leaflet popup override styles */}
      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          line-height: 1.4 !important;
        }
        .leaflet-popup-tip {
          background: rgba(2, 14, 31, 0.95) !important;
          border: 1px solid rgba(116, 247, 253, 0.3) !important;
          box-shadow: none !important;
        }
        .leaflet-container {
          background: #020e1f !important;
          font-family: 'SarasaMonoSC', monospace !important;
        }
        @keyframes sitePulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes aoiSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default CenterMapView
