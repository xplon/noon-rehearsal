# 主角资产与动画

当前主角使用 **Kay Lousberg 的 KayKit Adventurers 1.0 / Hooded Rogue**，许可为 **CC0 1.0**。保留了现成角色的网格、蒙皮与专业步态；这不是原创角色模型。我们去掉武器，将图集颜色转换为奶油白衣帽、珊瑚领巾/披风、靛蓝靴子等六种纯色材质，并制作项目需要的表演动作。没有使用付费 EXTRA 或 SOURCE 包。

- 官方仓库：https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- 固定版本：`672074b73ba276876a19e8816ecdc5241817ab47`
- 创作者：https://kaylousberg.com
- 许可原文：`assets-src/vendor/kaykit/LICENSE.txt`
- 来源 URL、文件 SHA-256：`assets-src/vendor/kaykit/PROVENANCE.json`

同时实际导入、渲染比较了免费 Mage。Hooded Rogue 的兜帽开口、脸部、靴子、披风更适合当前游戏的角色与影子辨认；Mage 的巨大帽檐遮挡脸部、改变影子重心。因此采用 Hooded Rogue。原始两个 GLB 和候选预览都保留在 `assets-src/vendor/kaykit/` 与 `assets-src/previews/`。

## 交付文件

| 文件 | 内容 |
| --- | --- |
| `public/assets/actor.glb` | 运行时角色，589,500 字节，完全自包含，无外部贴图 |
| `public/assets/actor-manifest.json` | 模型尺寸、材料、骨架、动作与测量值 |
| `assets-src/noon-actor.blend` | 从免费 GLB 导入后改编的可编辑源文件，约 1.6 MB，压缩保存 |
| `scripts/build_character.py` | 使用 Blender 4.5 重新生成角色、片段与预览 |
| `assets-src/validate_actor.py` | 导出数据、片段与循环接缝验证器 |
| `assets-src/actor-validation.json` | 对当前 GLB 的验证结果 |
| `assets-src/archive/build_character_v1.py` | 先前自制角色生成器归档；当前运行时不使用 |

模型在待机首帧可见高度为 **2.238505** 模型单位；最低点为 **-0.000864**。导出采用 glTF 标准 **Y-up、+Z 朝前**，根节点无水平位移。源几何包含 3,252 顶点、4,005 三角面；按六种材料拆成 16 个 glTF primitives。包含 42 个骨骼节点：原始 41 个节点加一个 `cape.tip` 披风变形骨骼。原始控制节点保留以维持源动画结构。`root/hips/spine/chest/head`、左右 `upperleg/lowerleg/foot/toes`、`upperarm/lowerarm/wrist/hand` 等节点名称沿用源文件。

原始 atlas 被转换为纯色材料；Three.js 替换 `MeshToonMaterial` 时保留 `material.color` 即可。主角为真正的立体蒙皮网格，影子可以克隆同一骨架并投影变形后的顶点。

## 片段与播放语义

| 名称 | 秒 | 循环 | 来源/行为 |
| --- | ---: | --- | --- |
| `idle` | 3.2 | 是 | 源 Idle 放慢，呼吸与重心起伏 |
| `walk` | 1.066667 | 是 | 源 Walking_A；专业抬膝、脚跟/脚掌动作、对侧手臂摆动 |
| `chase` | 0.8 | 是 | 源 Running_B 重定时；更明显的跑步重心变化 |
| `look` | 2.4 | 否 | 在源站姿上制作，头与胸部左右回看后归位 |
| `shrug` | 2.2 | 否 | 在源站姿上制作，双臂抬起与偏头后归位 |
| `sit` | 2.2 | 否，末帧保持 | 源 Sit_Floor_Down；1.4 秒坐下，后 0.8 秒保持坐地 |
| `rise` | 1.4 | 否 | 源 Sit_Floor_StandUp；由坐地恢复站立 |
| `bow` | 2.4 | 否 | 站立→胸、腰、头共同鞠躬→站立 |
| `turn` | 1.8 | 否 | 上身与头部转向再归位；不替代游戏世界中的人物朝向 |
| `struggle` | 2.4 | 是 | 脚和骨盆保持，胸肩、手臂、头部持续准备/抵抗 |

坐姿是**坐在地面**，双脚向前伸，不是椅子坐姿。坐下、起身时应保持角色世界根节点位置。`sit` 末帧与 `rise` 首帧所有导出变换完全一致；`rise` 末帧与 `idle` 首帧主体变换差小于 1.4e-6，只有披风的待机循环相位存在微小差异，可通过正常混合连接。`bow` 首尾站姿完全一致，不应以循环方式反复播放。

## 位移驱动步态

- `walk.strideLength = 1.00`：一个完整左右双步周期的模型空间距离。
- `chase.strideLength = 2.48`：一个完整跑步双步周期的模型空间距离。
- `chase.phaseOffset = 0.0625`：跑步左脚首次落地比步行周期起点稍晚；采样 chase 时使用 `(sharedPhase + 0.0625) % 1`。
- 角色缩放后，世界步幅也应乘同一缩放系数。相位按实际移动距离推进，不按按键持续时间推进。
- 同一混合阶段使用共同相位与连续动作权重，不要在每次输入变化时重新从 0 播放。

步幅依据源动作左脚支撑段的水平位移做最小二乘拟合：walk 周期距离 0.998257、chase 2.481813 模型单位。拟合残差范围分别为 0.054520、0.039886；源动作是手工动画，**不是严格零滑动的运动学约束解**。这些数值是支撑段近似匹配，不能宣称全程脚底完全锁定。源动作局部鞋底也有轻微穿地；接触投影/阴影与混合应在实际场景中观察。

最终 hips 上下范围：walk **0.054495**、chase **0.079238** 模型单位；旧自制步态约 0.003。`struggle` 中两只脚的世界空间移动范围测得 **0**，身体动作集中在脚以上。

## 视觉与数值检查

实际在 Blender 中渲染并检查了正面、侧面、背面、四分之三视图，以及 walk 的接触/经过/抬脚、chase、sit、rise、bow、shrug、struggle 姿态。预览位于 `assets-src/previews/`。这组预览使用普通光照，最终游戏中的 Toon 材质与投影仍应在浏览器里检查。

对 `idle/walk/chase/struggle` 的循环首尾做了对称切线处理；最终 GLB 所有循环通道首尾误差为 0，最大接缝角速度差为 2.43e-5 rad/s，最大平移/缩放速度差低于 4.5e-6。验证器对四元数计算角速度，而不是把四元数分量差当作旋转速度。所有数值有限，GLB 仅保留上述 10 个动作，皮肤关节数为 42，无外部资源引用。

```sh
blender --background --python scripts/build_character.py
python3 assets-src/validate_actor.py
```

设置 `NOON_SKIP_PREVIEWS=1` 可仅重新构建 GLB 和可编辑源文件。Blender 来自官方 macOS arm64 4.5.15 LTS 镜像，使用临时挂载目录内的二进制；没有覆盖系统安装的软件。当前 `.blend` 是改编后的可编辑工程，不是作者的付费原始 `.blend` 工程。
