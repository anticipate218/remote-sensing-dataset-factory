import React, { useEffect } from 'react'
import { WidgetPanel } from '../MFLayout'
import { useEcharts } from '@/hooks/useEcharts'
import * as echarts from 'echarts/core'

const FormatOverviewPanel: React.FC = () => {
  const { containerRef, setOption } = useEcharts()

  useEffect(() => {
    const formats = ['GeoTIFF', 'PNG', 'JPEG', 'HDF5', 'NetCDF']
    const values = [45, 32, 28, 12, 8]
    const resolutions = ['0.5m', '1m', '2m', '10m', '30m']

    setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(5, 50, 106, 0.9)',
        borderColor: 'rgba(116, 247, 253, 0.3)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const p = params[0]
          return `<div style="font-family:'Source Serif 4',serif">
            <b>${p.name}</b><br/>
            <span style="color:#74f7fd">Count: ${p.value}</span><br/>
            <span style="color:#b9cfff;font-style:italic;font-size:11px">GSD: ${resolutions[p.dataIndex]}</span>
          </div>`
        },
      },
      grid: { top: 20, right: 15, bottom: 28, left: 50 },
      xAxis: {
        type: 'category',
        data: formats,
        axisLine: { lineStyle: { color: 'rgba(200,200,200,0.12)' } },
        axisLabel: { color: '#b9cfff', fontSize: 10, fontFamily: "'Source Serif 4', serif" },
        axisTick: { show: false },
        name: 'Format',
        nameTextStyle: { color: '#b9cfff', fontSize: 9, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', padding: [8, 0, 0, 0] },
        nameLocation: 'center',
        nameGap: 22,
      },
      yAxis: {
        type: 'value',
        name: 'Datasets',
        nameTextStyle: { color: '#b9cfff', fontSize: 9, fontFamily: "'Source Serif 4', serif", fontStyle: 'italic', padding: [0, 50, 0, 0] },
        splitLine: { lineStyle: { color: 'rgba(200,200,200,0.08)', type: 'dashed' } },
        axisLabel: { color: '#b9cfff', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          barWidth: 22,
          data: values.map((v) => ({
            value: v,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(116, 247, 253, 0.9)' },
                { offset: 1, color: 'rgba(116, 247, 253, 0.15)' },
              ]),
              borderRadius: [3, 3, 0, 0],
            },
          })),
        },
      ],
    })
  }, [setOption])

  return (
    <WidgetPanel title="格式与分辨率" animationDelay={500}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </WidgetPanel>
  )
}

export default FormatOverviewPanel
