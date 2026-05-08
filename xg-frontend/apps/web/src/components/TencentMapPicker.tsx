import { useEffect, useRef, useState } from 'react';
import { Alert } from 'antd';

/**
 * 腾讯位置服务 GL 选点组件 — 销假围栏配置页用。
 *
 * 行为:
 *   · 加载腾讯地图 GL SDK(动态 <script>),需 `VITE_TENCENT_MAP_KEY` env
 *   · 显示当前围栏:中心 marker + 半径圆
 *   · 用户在地图上点击 → onChange 上报新中心(lat/lng);半径不在地图里改,
 *     交给外层 InputNumber 表单(更精确,且 GL SDK 没有内置「拖圆边」交互)
 *   · 外层 value 变化时,地图自动重画 marker + circle,实现表单 ↔ 地图双向绑定
 *
 * 缺 key 时:渲染 Alert 提示,父组件继续用 InputNumber 手填即可。
 *
 * 坐标系:GL SDK 默认 GCJ-02(火星),跟微信 `wx.getLocation type='gcj02'` 一致,
 * 后端 haversine 直接拿来比距离即可,无需转换。
 */

interface TMapLatLng {
  getLat(): number;
  getLng(): number;
}

interface TMapNs {
  Map: new (el: HTMLElement, opts: { center: TMapLatLng; zoom: number }) => TMapInstance;
  LatLng: new (lat: number, lng: number) => TMapLatLng;
  MultiMarker: new (opts: {
    map: TMapInstance;
    geometries: Array<{ id: string; position: TMapLatLng; properties?: Record<string, unknown> }>;
  }) => TMapMultiMarker;
  MultiCircle: new (opts: {
    map: TMapInstance;
    styles: Record<string, unknown>;
    geometries: Array<{ id: string; center: TMapLatLng; radius: number; styleId: string }>;
  }) => TMapMultiCircle;
  CircleStyle: new (opts: { color: string; borderColor: string; borderWidth: number }) => unknown;
}

interface TMapInstance {
  on(evt: 'click', cb: (e: { latLng: TMapLatLng }) => void): void;
  destroy(): void;
}

interface TMapMultiMarker {
  setGeometries(g: Array<{ id: string; position: TMapLatLng; properties?: Record<string, unknown> }>): void;
}

interface TMapMultiCircle {
  setGeometries(g: Array<{ id: string; center: TMapLatLng; radius: number; styleId: string }>): void;
}

declare global {
  interface Window {
    TMap?: TMapNs;
  }
}

const SDK_KEY = import.meta.env.VITE_TENCENT_MAP_KEY;

let sdkPromise: Promise<TMapNs> | null = null;

function loadSDK(): Promise<TMapNs> {
  if (!SDK_KEY) return Promise.reject(new Error('NO_KEY'));
  if (window.TMap) return Promise.resolve(window.TMap);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<TMapNs>((resolve, reject) => {
    const cbName = `__tmap_init_${Date.now()}`;
    (window as unknown as Record<string, () => void>)[cbName] = () => {
      delete (window as unknown as Record<string, unknown>)[cbName];
      if (window.TMap) resolve(window.TMap);
      else reject(new Error('SDK 加载完成但 window.TMap 缺失'));
    };
    const s = document.createElement('script');
    s.src = `https://map.qq.com/api/gljs?v=1.exp&key=${SDK_KEY}&callback=${cbName}`;
    s.onerror = () => reject(new Error('腾讯地图 SDK 加载失败,检查 key / 网络'));
    document.body.appendChild(s);
  });
  return sdkPromise;
}

interface Value {
  centerLat: number;
  centerLng: number;
  radiusM: number;
}

interface Props {
  value: Value;
  /** 仅当用户点击地图改中心点时触发(半径变更走外层 InputNumber)。 */
  onChange: (v: Value) => void;
  height?: number;
}

export default function TencentMapPicker({ value, onChange, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TMapInstance | null>(null);
  const markerRef = useRef<TMapMultiMarker | null>(null);
  const circleRef = useRef<TMapMultiCircle | null>(null);
  const tmapNsRef = useRef<TMapNs | null>(null);
  // 用 ref 持最新 value,click handler 内部读 ref 拿到当前半径。
  const valueRef = useRef(value);
  valueRef.current = value;

  const [error, setError] = useState<string | null>(null);

  // 初始化(只跑一次)
  useEffect(() => {
    if (!SDK_KEY) {
      setError('NO_KEY');
      return;
    }
    let cancelled = false;
    loadSDK()
      .then((TMap) => {
        if (cancelled || !containerRef.current) return;
        tmapNsRef.current = TMap;
        const center = new TMap.LatLng(valueRef.current.centerLat, valueRef.current.centerLng);
        const map = new TMap.Map(containerRef.current, { center, zoom: 16 });
        mapRef.current = map;

        markerRef.current = new TMap.MultiMarker({
          map,
          geometries: [{ id: 'c', position: center, properties: { title: '校园中心' } }],
        });
        circleRef.current = new TMap.MultiCircle({
          map,
          styles: {
            def: new TMap.CircleStyle({
              color: 'rgba(22, 119, 255, 0.18)',
              borderColor: '#1677ff',
              borderWidth: 2,
            }),
          },
          geometries: [{ id: 'c', center, radius: valueRef.current.radiusM, styleId: 'def' }],
        });

        map.on('click', (e) => {
          const lat = e.latLng.getLat();
          const lng = e.latLng.getLng();
          onChange({
            centerLat: lat,
            centerLng: lng,
            radiusM: valueRef.current.radiusM,
          });
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // value 变化时同步地图(form 改了半径或经纬度)
  useEffect(() => {
    const TMap = tmapNsRef.current;
    if (!TMap || !markerRef.current || !circleRef.current) return;
    const c = new TMap.LatLng(value.centerLat, value.centerLng);
    markerRef.current.setGeometries([{ id: 'c', position: c, properties: { title: '校园中心' } }]);
    circleRef.current.setGeometries([{ id: 'c', center: c, radius: value.radiusM, styleId: 'def' }]);
  }, [value.centerLat, value.centerLng, value.radiusM]);

  if (error === 'NO_KEY') {
    return (
      <Alert
        type="info"
        showIcon
        message="未配置腾讯地图 key"
        description={
          <span>
            想用地图选点把 <code>VITE_TENCENT_MAP_KEY</code> 加到 <code>apps/web/.env.local</code>。
            申请入口:<a href="https://lbs.qq.com/dev/console/key/manage" target="_blank" rel="noreferrer">腾讯位置服务控制台</a>。
            没 key 也能跑,直接在下方手填经纬度即可。
          </span>
        }
      />
    );
  }
  if (error) {
    return <Alert type="error" showIcon message="地图加载失败" description={error} />;
  }
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        borderRadius: 8,
        border: '1px solid var(--border-1, #eee)',
        overflow: 'hidden',
      }}
    />
  );
}
