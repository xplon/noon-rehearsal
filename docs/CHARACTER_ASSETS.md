# 主角资产与动画（v5）

当前主角仍采用 **Kay Lousberg 的 KayKit Adventurers 1.0 / Hooded Rogue**，许可为 **CC0 1.0**。保留现成资产的拓扑、身体蒙皮与动作素材，再改为修长的舞台旅人比例。没有换角色主题，也没有使用付费 EXTRA 或 SOURCE 包。

- 官方仓库：https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- 固定版本：`672074b73ba276876a19e8816ecdc5241817ab47`
- 创作者：https://kaylousberg.com
- 原始许可：`assets-src/vendor/kaykit/LICENSE.txt`
- 来源 URL、SHA-256：`assets-src/vendor/kaykit/PROVENANCE.json`

之前实际导入、渲染比较了免费 Mage。Hooded Rogue 的兜帽、脸部、靴子与披风轮廓更适合当前游戏，故继续改编它。原始两个 GLB 和候选预览仍保留。当前 `.blend` 是从免费 GLB 导入并修改的可编辑工程，不是作者的付费原始工程。

## v5 原地转身脚步

v5 增加 `pivot_left` / `pivot_right`，现有 v4 网格、蒙皮、42 骨骼、12 个片段与步幅不变。每个循环 28/30 秒（0.933333 秒，含重复尾帧共 29 帧），方向侧的脚先抬起，另一脚随后跟进；双脚之间有站稳换重心的时刻。脚底最高抬起约 0.1096 模型单位，骨盆仅上下 0.008，手臂不做夸张摆动。

这两个片段只负责脚部表演，**不烘焙根节点转向、水平移动或头部转向**。运行时先用世界坐标目标引导目光，再旋转角色根节点并混入对应脚步，朝向合适后才能开始平移和走路。建议以实际累计转角驱动相位：`phase += abs(deltaHeading) / (π / 2)`，通过 `phase % 1` 采样，转动一整圈相当于四次完整的左右换脚。`turnAnglePerCycle` 已写入 manifest。不要用旧 `turn` 片段叠加头部寻找动作；头部视线由引擎独立处理。两种方向切换时保持相位，并平滑调整权重。

`assets-src/actor-v5-preservation.json` 对 git HEAD 保存的 v4 GLB 做了逐值比较：所有旧网格属性、索引、逆绑定矩阵、12 片段采样时间与变换的最大差均为 0。新增片段首尾变换相同，与 `idle` 首帧的最大变换分量差为 3.66e-7；循环接缝平移与角速度差为 0。头部局部四元数全程不变，导出骨盆 XZ 变化小于 1.2e-9。

`assets-src/actor-pivot-contact-validation.json` 使用实际蒙皮后脚部顶点审计，脚底最低约 -5.08e-5，支撑脚脚底最高约 9.84e-5 模型单位；支撑脚脚踝坐标变化小于 2.4e-7。该审计针对资产自身；外部根节点旋转、视线叠加与动画混合仍需要运行时验证，不代表世界空间脚锁定。通用循环切线平均会让交替脚步边界轻微下穿，故 v5 的两个循环在双脚支撑接缝使用零速度切线。

已渲染并检查五个实际姿势，汇总图为 `assets-src/previews/pivot-v5-contact-sheet.png`，可用 `assets-src/make_pivot_preview.py` 重新排版。

## 沿用 v4 的意外反应

v4 仅增加两个项目制作的表演片段，基于当前站姿，不改变 v3 比例、网格、42 骨骼、原有 10 个动作或步幅。`surprise` 在约 0.32 秒出现短促抬头、肩部微提与双手反应，然后平滑回落；`reach` 在约 0.65 秒前倾并伸出右手，短暂停留后收回。两者都不跳跃、不移动根节点或骨盆；实际追随、迈步、转向与视线目标由引擎处理。披风有延迟响应。

两个片段首尾均匹配 `idle` 首帧：`reach` 所有通道误差为 0，`surprise` 最大误差 5.6e-17。播放一次并正常淡入/淡出即可，不应每帧重新触发。姿态预览：`previews/surprise.png`、`previews/reach.png`、`previews/reach-side.png`。

`assets-src/actor-v4-preservation.json` 记录与 v3 基线 GLB 的逐值比较：网格属性、索引、逆绑定矩阵和旧 10 个片段的采样时间/变换全部一致，最大差为 0；报告包含基线与当前 GLB 的 SHA-256。

## 沿用 v3 的比例与实现

同构图、按站立总高度归一的前后对比：`assets-src/previews/proportions-v2-v3.png`。图中人物总高度相当；游戏里新版人物另由运行时缩小 10%，两件事分开处理。

| 测量/参数 | v3 |
| --- | ---: |
| 站立模型高度 | 2.649742 |
| 可见头部及兜帽高度 | 0.589034 |
| 总高度 / 兜帽高度 | 4.498（约 4.5 头身） |
| 头部与兜帽相对源模型缩放 | 0.56 |
| 躯干宽度 | 源模型的约 0.76–0.80 |
| 躯干长度 | 分段 1.20–1.23 |
| 上、下腿骨长度 | 分段 3.0（源模型腿很短） |
| 上、下臂长度 | 分段 1.5 |
| 手部 / 脚部尺寸 | 0.68 / 0.78 |
| 腹部局部额外收窄 | 8% |

不是把整个模型纵向拉长：不同部位分别塑形，缩小头、手、脚，收窄躯干，延长四肢；脚踝改成与裤腿连续的靛蓝色。按原始骨骼权重将比例改动烘焙到静止网格与骨架，再重定向姿势。动画中不留下非均匀关节缩放，避免 glTF 无法表达的继承剪切。

直接延长腿会把原 Q 版步幅和抬膝放大。v3 使用双骨 IK 重新匹配脚部目标，保留源动作的左右脚顺序、脚部朝向与膝盖朝向，降低抬脚高度，重新调整骨盆起伏；上臂摆幅缩小到源动作相对待机偏移的 58%，待机肩臂自然下垂约 0.13 rad。躯干表演与动作节奏仍来自现有片段。

披风原来是挂在胸骨上的刚性对象；v3 已转换成真正的蒙皮网格，由 `chest` 与 `cape.tip` 加权控制。坐下时向后收折，起身时恢复。缩头后露出的领口穿插来自上臂袖子；将领巾上缘前移，形成连续覆盖，已用实际步行姿态和射线命中检查。

## 文件与接口

| 文件 | 内容 |
| --- | --- |
| `public/assets/actor.glb` | 当前运行时角色，677,348 字节，完全自包含 |
| `public/assets/actor-manifest.json` | 尺寸、比例参数、材料、骨架、片段与测量值 |
| `assets-src/noon-actor.blend` | 可编辑压缩工程，约 2.0 MB |
| `scripts/build_character.py` | 导入、配色、片段制作、导出与预览 |
| `assets-src/retarget_proportions.py` | 比例烘焙、IK、足底支撑与手臂动作重定向 |
| `assets-src/validate_actor.py` | GLB 数值、动作、循环与坐起衔接验证 |
| `assets-src/validate_contact.py` | Blender 全片段逐帧接地审计 |
| `assets-src/actor-validation.json` | 当前 GLB 验证结果 |
| `assets-src/compare_actor_preservation.py` | 比较基线 GLB 与当前网格/旧片段 |
| `assets-src/actor-v4-preservation.json` | v4 对 v3 的精确保留验证 |
| `assets-src/actor-v5-preservation.json` | v5 对 v4 的精确保留验证 |
| `assets-src/actor-pivot-contact-validation.json` | 新转身片段逐脚接地与根/骨盆固定检查 |
| `assets-src/make_pivot_preview.py` | 新转身片段五姿势汇总图 |
| `assets-src/actor-contact-validation.json` | 逐帧脚底、身体与披风高度范围 |
| `assets-src/archive/build_character_v2.py` | 旧比例的可复现生成器；旧预览也在 archive 内 |

模型包含 3,252 顶点、4,005 三角面、42 个骨骼节点（原始 41 个加 `cape.tip`），导出为 16 个材质 primitives。`root/hips/spine/chest/head`、左右 `upperleg/lowerleg/foot/toes` 与 `upperarm/lowerarm/wrist/hand` 等名称保持不变。

采用 **Y-up、+Z 朝前**，根节点无水平位移。站立脚底基准为 0。六种纯色材料已经替代原 atlas，Three.js 替换 `MeshToonMaterial` 时保留 `material.color` 即可。没有外部纹理依赖。影子可以克隆相同骨架，投影变形后的立体网格。

## 片段

| 名称 | 秒 | 播放 | 行为 |
| --- | ---: | --- | --- |
| `idle` | 3.2 | 循环 | 源 Idle 的呼吸与重心变化，适配新比例 |
| `walk` | 1.066667 | 循环 | 源 Walking_A 经步幅/IK/摆臂重定向 |
| `chase` | 0.8 | 循环 | 源 Running_B 经重定时与重定向 |
| `look` | 2.4 | 单次 | 头与胸部左右回看后归位 |
| `shrug` | 2.2 | 单次 | 双臂抬起与偏头后归位 |
| `sit` | 2.2 | 单次，末帧保持 | 1.4 秒坐下，后 0.8 秒坐地保持 |
| `rise` | 1.4 | 单次 | 由坐地恢复站立 |
| `bow` | 2.4 | 单次 | 站立→胸腰与头部鞠躬→站立 |
| `turn` | 1.8 | 单次 | 上身与头转向再归位 |
| `struggle` | 2.4 | 循环 | 双脚保持，胸肩、手臂、头部准备/抵抗 |
| `surprise` | 1.2 | 单次 | 抬头、肩部微提与双手短促反应后归位 |
| `reach` | 1.5 | 单次 | 前倾、伸右手想跟上，然后收回归位 |
| `pivot_left` | 0.933333 | 循环 | 左脚先提起、右脚跟进的原地脚步；根转向由运行时控制 |
| `pivot_right` | 0.933333 | 循环 | 右脚先提起、左脚跟进的原地脚步；根转向由运行时控制 |

坐姿是坐在地面，双脚向前伸。坐下和起身期间保持角色世界根节点位置。`sit` 末帧与 `rise` 首帧所有导出变换完全一致；`rise` 末帧与 `idle` 首帧主体变换差小于 5.4e-7，仅披风待机循环相位有约 0.00449 的四元数分量差，可正常混合。`bow` 首尾站姿一致。

## 位移驱动与新步幅

- `walk.strideLength = 1.637`：一个完整左右双步周期的模型空间距离。
- `chase.strideLength = 3.634`：一个跑步双步周期的模型空间距离。
- `chase.phaseOffset = 0.0625`：采样时使用 `(sharedPhase + 0.0625) % 1`，左右脚次序一致。
- 归一高度为 2.07 时，世界步幅约为 **1.279 / 2.839**。不要沿用 v2 的 1.00 / 2.48 模型空间步幅。
- 相位按实际移动距离推进；缩放人物时同时缩放步幅。动作切换保留连续相位和权重。

步幅来自最终骨架左脚支撑段的水平位移拟合：walk 1.637056、chase 3.633741 模型单位/周期，残差范围分别为 0.109645、0.089225。这是动作与位移的近似匹配，不代表脚在整个支撑段完全没有水平滑动。IK 保证的是合适的腿部姿势与垂直接地；它不是全程水平脚锁定。

最终骨盆上下范围：walk **0.039685**、chase **0.087206** 模型单位。长腿初版被放大的高抬腿与大跨步已收敛。`struggle` 双脚位移范围为 0。

## 检查证据

已实际渲染并查看正面、侧面、背面、四分之三，以及 walk 接触/经过/抬脚、chase、sit、rise、bow、shrug、struggle；规范预览在 `assets-src/previews/`。中间比例探针供过程讨论使用，最终判断以当前 GLB 和规范预览为准。

对最终全部动作逐帧检查：

- walk 最低脚底高度范围 **[-0.00017412, 0.00024036]** 模型单位（循环接缝烘焙造成的极小误差）。
- idle、sit、rise、bow、look、shrug、turn、struggle 的脚底基准误差接近浮点 0。
- chase 双脚腾空最高 **0.05910665** 模型单位，保留跑步腾空。
- sit 最后身体最低点 **0.00133967**；整个坐下片段披风最低点 **0.04984343**，不穿地。
- 六个循环片段首尾变换误差为 0，最大接缝角速度差 < **2.6e-5 rad/s**，最大平移/缩放速度差 < **1.9e-5**。
- 新增 `surprise` / `reach` 的骨盆与双脚位移范围均为 0，脚底高度约 -1e-7；披风最低点分别为 0.70658624 / 0.70658624，没有穿地。
- 所有数值有限，共 14 个动作、42 个关节，无外部资源引用。

这些是几何、动作与接地检查；最终 Toon 材质、动画混合和影子仍需在浏览器中检视。

```sh
blender --background --python scripts/build_character.py
python3 assets-src/validate_actor.py
blender --background --python assets-src/validate_contact.py
```

设置 `NOON_SKIP_PREVIEWS=1` 可只重建 GLB 和源工程；`NOON_PREVIEW_CLIPS=pivot_left,pivot_right` 只渲染新增动作预览，不重做旧预览。对比排版脚本 `assets-src/make_proportion_comparison.py` 需要 Pillow。Blender 使用官方 macOS arm64 4.5.15 LTS 临时镜像内的二进制，没有覆盖系统软件。
