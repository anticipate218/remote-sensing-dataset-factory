import { useRef, useEffect, useCallback } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, GaugeChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GaugeChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
])

export function useEcharts() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const pendingOption = useRef<EChartsOption | null>(null)

  const setOption = useCallback((option: EChartsOption) => {
    if (!containerRef.current) {
      pendingOption.current = option
      return
    }
    const { clientWidth, clientHeight } = containerRef.current
    if (clientWidth === 0 || clientHeight === 0) {
      pendingOption.current = option
      requestAnimationFrame(() => {
        if (pendingOption.current) setOption(pendingOption.current)
      })
      return
    }
    pendingOption.current = null
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, {
        renderer: 'canvas',
      })
    }
    chartRef.current.setOption(option, { notMerge: false })
  }, [])

  const resize = useCallback(() => {
    chartRef.current?.resize()
  }, [])

  const clear = useCallback(() => {
    chartRef.current?.clear()
  }, [])

  useEffect(() => {
    const handleResize = () => resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [resize])

  return { containerRef, chartRef, setOption, resize, clear, echarts }
}

export default useEcharts
