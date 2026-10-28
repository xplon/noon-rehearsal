# 庭院材质与渲染

`src/stage-materials.ts` 使用三档可编辑色阶表达形体，阴影单独保留 Three 的真实遮挡结果。目标是珊瑚、蜂蜜与群青组成的舞台画面，而不是给每个模型折角加黑线。

## 接入场景

```ts
import {STAGE_COLORS as C,createStageMaterial,type StageSurfaceRole} from './stage-materials';

materialCache=new Map<string,THREE.MeshToonMaterial>();
material(color:number,role:StageSurfaceRole='environment',side:THREE.Side=THREE.FrontSide){
  const key=`${role}:${color}:${side}`;
  if(!this.materialCache.has(key)){const material=createStageMaterial(color,role);material.side=side;this.materialCache.set(key,material);}
  return this.materialCache.get(key)!;
}
```

把 `createRig` 中非影子的材质调用改为 `this.material(color,'actor',original.side)`；场景网格继续用默认角色。主影子继续使用原有群青 `MeshBasicMaterial` 与骨骼投影，不能改成此材质。`STAGE_COLORS` 保留原场景颜色键和值，因此环、旁白界面、背景色不需要跟随改色。

原 `gradient` 纹理和旧 `material()` 的 `noonShade` shader 不再需要。原方向光位置 `(-10,16,-8)` 保持不变；材质中的 `stageSunDirection` 与它一致。如果将来移动光源，必须同步修改。环境光/方向光强度不会再把所有表面推到同一个色阶。场景维持 `SRGBColorSpace` 和末端 `OutputPass`，不要再手工做 gamma 转换。

## 表面与阴影

- 珊瑚墙采用暖红中间调、偏桃色亮部、微紫暗部；向上的屋面自然更明亮。侧立面依世界法线分层，转动相机不会使颜色跟着相机移动。
- 拱廊和屋檐的真实阴影混入独立梅紫色；背光面已经有形体暗部，避免再完整叠加一次自阴影，把整个立面压成紫色。
- 地面用蜂蜜亮部和暖赭投影。叙事主影子的群青保持独立，不能靠通用黑影或染蓝所有阴影来替代它。
- 角色识别现有 GLB 的六个原始颜色。奶油衣服、珊瑚斗篷、皮革和脸部各用自己的色阶；色阶过渡比建筑更宽，保留骨骼、法线与原模型形体。
- 小道具的其他颜色按其原色推导色阶。当前适配的是纯色资产；贴图颜色、AO 贴图与修改 `material.color` 的动态染色没有接入绘制色阶，需要未来单独支持。

色阶数据在模块顶部的 `environmentRamps` 和 `actorRamps`，所有色值按 sRGB 编写并由 `THREE.Color` 转成线性。色阶混合、真实阴影、环境接触遮蔽均在线性空间完成。

地面增加弱的解析接触遮蔽，覆盖后廊各根柱脚、两个固定花盆、座椅脚与右侧陶罐。它依据真实落地点的圆/矩形距离平滑衰减，强度上限为 22%，不画圆环或轮廓线；不会暗化屋顶，也不会投到人物。它不是通用 SSAO，物件移动后应同步更新相应坐标。角色脚底不在这里新增固定阴影，避免与分离/延迟的叙事影子冲突。

## 线条取舍

`ink-outline.ts` 保留可选的整个人物外轮廓 pass，但默认 `enabled=false`。绘制形体首先靠材质、明暗和色块。若美术对比需要开启，默认强度为 `.8`、最大 alpha `.22`，只选择整个角色，主影子与教学覆盖层继续排除。不要把所有建筑加入此 pass。

主场景已按以下方式接入，几何不变：

- 已停止 `mesh()` 为每个 box/arch 生成 `EdgesGeometry`。单纯改 `box()` 默认值仍不足以移除拱、座椅等显式 `true` 的调用。
- 如果保留平台最外侧轮廓，颜色使用偏红的 `C.darkCoral`，alpha 不超过 `.16`；不要再描楼梯踏面、窗台、每条檐口的所有边。
- 地面网格由 `.33` 降到约 `.16`，裂纹由 `.25` 降到 `.18`；保留地面材质感，避免棋盘格抢过人物。
- 后廊檐口小刻痕由黑色 `.5` 降为 `C.darkCoral`、`.20`；这是有意的建筑节奏，可以保留。
- 门板缝降低到 `.22`；门旁方向箭头是场景中的指引符号，可以保留原有清晰度。
- `resize()` 使用 `.6*pixelRatio`；默认仍关闭外轮廓 pass。

## 验证边界

材质沿用 Three r186 的 `MeshToonMaterial`、蒙皮变形、法线和原生 shadow map chunk；`shadowmask_pars_fragment` 被显式引入，避免靠总亮度猜测是否处于阴影。TypeScript 和 shader 模板展开可以离线检查，但不能替代最终 WebGL 编译与实际画面验收。

最终预览应检查：正面/侧面/屋面是否能分层，拱内暗部是否仍有颜色；人物转身时奶油色是否保持可读，斗篷是否出现锯齿色带；阴影引导阶段群青是否仍一眼可辨；桌面与横屏是否存在新 shader 报错或帧率异常。本模块不修改镜头、模型比例、运动逻辑或建筑几何。

角色保留 GLB 原材质的双面设置，避免开放兜帽、斗篷薄片背面消失。缓存键包含 side；旗帜、植物叶片的双面变体不会修改门窗等同色材质。不能用普通 Material.clone() 复制此材质，因为 Three 不复制自定义 shader 回调。
