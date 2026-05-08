/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 腾讯位置服务 JavaScript GL key,用于销假围栏配置页地图选点。
   *  申请入口:https://lbs.qq.com/dev/console/key/manage
   *  缺失时配置页降级为纯手动输入经纬度。 */
  readonly VITE_TENCENT_MAP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
