# 知树国风灵狐角色制作规格书

版本：v1.3  
日期：2026-11-04  
生产代码：`KT-FOX-01`  
角色商业名称：不在本规格内决定  
适用产品：知树 Web App、移动网页与后续 App 壳层

## 1. 交付目标

把小黑狐从静态吉祥物升级为有完整身体、表情和动作语言的动画角色。它首先要像一个可信的狐狸角色，其次才承担产品引导。

最终角色必须同时满足以下目标：

1. 在 48 px 的小尺寸下仍能通过耳朵、长吻、长尾和身体姿态辨认出狐狸。
2. 在 160–240 px 的主视觉尺寸下具备足够细节，能看到毛发层次、眼睛方向、金属色纹样和动作重心。
3. 形象可被稳定复现，不同角度、表情和姿态不得改变头身比例、纹样数量和尾巴形状。
4. 所有动作都能由 2D 骨骼动画实现，不依赖逐帧重画全部身体。
5. 手机上流畅、轻量、可关闭动画，并在不播放动画时仍然完整可用。

本阶段只制作角色设计、动作规范与可绑骨资产，不在本规格内实现页面代码。

## 2. 一句话设定

一只生活在知识树里的国风四足灵狐：安静、敏锐、聪明，但不是神明、机器人或萌宠。它通过耳朵、眼睛、步态和尾巴表达情绪，用嘴叼着一枚“知识叶”把用户带到待处理的知识。

角色与用户的关系是“同行者”，不是管理者。

## 3. 产品行为边界

角色最高采用 L2 权限：

- 可以出现、移动、指向、叼取视觉道具、播放状态反馈。
- 可以在用户点击后打开采集、待归类或回顾流程。
- 不代替用户填写、分类、保存、合并、删除或发布内容。
- 不自动修改正文，不自动完成任务。
- 删除、注销、批量修改等高风险管理动作永远不能由角色静默触发。

角色登录后在核心页面全局常驻，默认停在右下角安全区，可收起。不得遮挡正文、输入框、提交按钮或底部导航。

## 4. 美术方向

### 4.1 核心风格

- 现代东亚二维动画角色设计语言，原创形象。
- 半写实狐狸解剖结构，搭配受控的动画夸张。
- 赛璐璐分层上色，主色块清楚，阴影边缘略柔和。
- 线稿干净，不使用粗黑漫画描边。
- 轻微宣纸颗粒、墨色边缘和描金质感只作为表面细节，不能盖过角色轮廓。
- 眼睛具有动画表现力，但不使用占据半张脸的大眼萌系比例。

### 4.2 必须避免

- 3D 玩偶、PVC 手办、毛绒公仔或玩具材质。
- 大头 Q 版、短腿吉祥物、贴纸图标。
- 拟人狐妖、穿汉服的狐娘、人类手掌、两足站立拟人身体。
- 机械狐、赛博霓虹、青色发光装备。
- 写实动物照片式毛发。
- 过亮金色、全身发光、仙侠特效堆叠。
- 直接模仿现存游戏、动画、艺术家或已有 IP 的角色造型。
- 画面内文字、签名、水印、边框和拼贴标签。

### 4.3 摄影与展示规则

角色资产本身使用中性展示条件，避免生成图自带剧情背景：

- 主光从左上方来。
- 右后方保留一层低强度暖色轮廓光。
- 背景使用暖灰或纸白色，最终资产另行输出透明底。
- 不使用强透视、广角镜头、运动模糊或景深。
- 角色完整入画，四肢和尾巴不能被裁切。

### 4.4 已批准的产品角色锚点

2026-11-04 已确认采用：

- `references/kt-fox-01_transparent-anchor-v1.png`：正式角色生产母版，2048 × 2048，带真实透明通道。锁定四足比例、三层黑灰毛色、琥珀眼、三处金纹和单尾回弯。
- `references/kt-fox-01_transparent-web-v1.png`：512 × 512 透明网页版本，用于界面预览与轻量加载。
- `references/kt-fox-01_proportion-anchor-v1.jpeg`：只保留为米色底构图和比例参考，不再作为产品贴图。
- `references/kt-fox-01_rimlight-reference-v1.png`：只保留为产品界面中的暖金轮廓光参考，不再用于重新生成角色。

后续界面开发不再反复重设角色长相。首版产品把透明主锚点作为动态主形象，并允许：

- 透明角色淡入、淡出、呼吸缩放和整体位置移动。
- 在安全区内持续轻微浮动、短暂跳跃、探头、缩回和出现到目标按钮附近。
- 点击角色触发一次跳跃反馈，点击气泡进入对应流程。
- 用透明度、方向、停顿和轻微旋转表现情绪节奏。

首版禁止：

- 把静态整图左右拖动并伪装成四足奔跑。
- 为凑动作而拉伸四肢、断尾或改变头身比例。
- 在滚动和输入过程中连续播放大幅位移。

真正的四足跑、嗅看、叼叶和回头动作属于后续动画制作资产。届时应基于主锚点重绘侧身分层，再进入 Rive 绑骨；不在页面代码中伪造骨骼动画。

## 5. 解剖与比例

### 5.1 基础比例

以头部宽度为 `1U`：

| 部位 | 目标比例 | 设计要求 |
|---|---:|---|
| 头部宽度 | 1.00U | 略大于真实狐狸约 8%，便于阅读表情 |
| 鼻尖到尾根 | 3.20U | 身体修长，胸腔深、腰部收 |
| 肩高 | 1.55U | 成年灵狐感，不做幼崽比例 |
| 前腿长度 | 1.25U | 关节清楚，脚掌小而稳 |
| 尾巴长度 | 2.35U | 蓬松但收束，尾尖向左上自然回弯 |
| 耳朵高度 | 0.72U | 尖耳，耳根宽，左右不完全对称 |
| 单眼宽度 | 0.18U | 杏仁形，琥珀色虹膜 |

正视图肩宽约为头宽的 `1.45` 倍。侧视图胸腔深度约为肩高的 `0.58` 倍。尾巴最宽处约为头宽的 `0.82` 倍，不能变成松鼠尾。

### 5.2 造型特征

- 头部：狐狸长吻清楚，鼻梁略直，鼻头小且为深暖灰。
- 眼睛：外眼角略上扬，内眼角向下，表情冷静、聪明。
- 耳朵：宽三角尖耳，内侧为深棕灰，不发光。
- 四肢：真实四足步态，脚掌有清楚趾部，不穿鞋。
- 尾巴：由肩后自然下垂再回弯；不分成多尾。
- 身体：黑灰主色，胸腹略浅，脸颊下缘有一小块暖灰过渡。
- 面部不能做成人脸结构，不画人类眉毛、嘴唇或睫毛。

### 5.3 标志性纹样

全身只保留三组金色纹样，避免生成图越画越复杂：

1. **额心芽印**：一枚高约 `0.16U` 的细长芽形金印，位于两耳之间偏下。形似一片向上生长的叶芽，不做眼睛或宝石。
2. **胸前枝印**：从颈下分出一短一长两条细金线，形成克制的枝杈，不贯穿腹部。
3. **尾尖回纹**：尾巴末段有一道连续的细金弧线，末端向内侧回卷，不形成复杂符文。

纹样像旧金箔压在毛发上，饱和度低，不应发出霓虹光。

### 5.4 随身道具

唯一固定道具为“知识叶”：

- 形状：细长、略不对称的叶片，类似简化叶芽，不是绿色树叶图标。
- 材质：暖纸色半透明薄片，边缘有一道旧金线。
- 尺寸：长度约 `0.42U`，可以由嘴叼住。
- 作用：角色叼住它时，表示“有内容需要用户查看或整理”。
- 交接：知识叶只在视觉层移动；真正写操作仍由用户点击确认。

## 6. 色彩与材质

| 用途 | 色值 | 使用规则 |
|---|---|---|
| 墨黑主毛色 | `#1B1B18` | 身体最大面积，不使用纯黑 `#000000` |
| 炭灰亮面 | `#2A2923` | 背部和头部受光面 |
| 暖灰腹面 | `#3B372F` | 胸腹与下颌，只做 10%–15% 面积 |
| 耳内与鼻 | `#4A3A2F` | 低饱和暖棕，不做粉色 |
| 旧金纹样 | `#C6A15B` | 额头、胸线、尾尖，约占全身 2% |
| 高光金 | `#E0C481` | 只用于最细的受光边缘 |
| 琥珀眼 | `#D99A3D` | 虹膜主色 |
| 纸色高光 | `#EDE4D2` | 眼睛高光、知识叶、展示纸背景 |
| 墨线 | `#0E0E0C` | 外轮廓与结构线，不使用纯黑粗线 |

材质规则：

- 毛发以形状和明暗分组表现，不逐根绘制。
- 金色纹样是哑光描金，不是金属反光贴花。
- 眼睛最多两个小高光，避免玻璃珠感。
- 尾巴可分为三到四个明暗层级，不使用柔焦渐变糊成毛条。

## 7. 标准图纸与资产

### 7.1 三视图

生产图纸使用 A3 横版，建议源文件尺寸 `4961 × 3508 px / 300 dpi`。数字生成阶段可先使用 `3840 × 2160 px`，再进入绘图软件清理。

三视图必须包含：

1. 正面全身。
2. 左侧四分之三全身。
3. 左侧全身。
4. 背面全身。
5. 头部四分之三放大图。
6. 尾巴正面、侧面和弯曲极限。

所有视角使用同一基线、同一肩高、同一头宽。脚掌落在同一条地面线上，不使用戏剧性透视。

### 7.2 表情表

生成八组同角度胸像：

1. 平静。
2. 好奇。
3. 专注倾听。
4. 思考。
5. 开心但不幼稚。
6. 担心或道歉。
7. 困倦但保持优雅。
8. 决心已定。

表情变化优先通过耳朵、眼睑、头部角度和尾巴完成，不允许改变脸颊结构或把眼睛放大成另一种画风。

### 7.3 动作表

至少输出以下动作：

- 站立待机。
- 安静坐下。
- 四足奔跑八帧循环。
- 起跳、腾空、落地三段。
- 低身嗅看。
- 叼着知识叶返回。
- 转头指向目标。
- 成功后尾巴回卷、轻跳一次。
- 错误或取消时耳朵后收、身体降低。

动作不能包含写字、点击屏幕、拿手机、穿衣服或人类手势。

### 7.4 资产清单

每个文件均使用透明或纯色中性背景，不带 UI、文字和水印：

| 文件 | 内容 | 建议尺寸 |
|---|---|---|
| `kt-fox-01_turnaround_v01.png` | 四视图与细节 | 3840 × 2160 |
| `kt-fox-01_expressions_v01.png` | 八组表情 | 3840 × 2160 |
| `kt-fox-01_poses_v01.png` | 主要动作姿态 | 3840 × 2160 |
| `kt-fox-01_idle_v01.png` | 待机主视觉 | 2048 × 2048，透明 |
| `kt-fox-01_run-loop_v01` | 八帧奔跑序列 | 每帧 1024 × 1024 |
| `kt-fox-01_layers_v01.psd` | 分层源文件 | 4096 × 4096 |
| `kt-fox-01_rive_v01.riv` | 骨骼与状态机 | 按 Rive 工程输出 |
| `kt-fox-01_poster_v01.webp` | 不播放动画时的静态图 | 512 × 512 |

## 8. 推荐生成流程

不要让绘图软件一次生成“所有角度、表情、动作和配色”的完整大图。多角色小图通常会走形。按以下顺序迭代：

### 第一步：角色锚点

先生成单张四分之三全身角色，只确认头身比、眼睛、耳朵、尾巴和金纹位置。V2 使用 `proportion-anchor-v1` 控制身体比例和纹样，使用 `rimlight-reference-v1` 控制暖金轮廓光。选定 V2 后，用 V2 锚点替代这两张参考，作为后续所有生成的 `Image 1: character identity reference`。

### 第二步：三视图

用锚点图作为角色身份参考，生成四视图。每个视角保持同一比例和纹样。若软件不能稳定生成四视图，则分别生成正面、侧面、背面，再在绘图软件中排到标准图纸里。

### 第三步：表情与动作

继续使用已选锚点图，分别生成表情表和动作表。每一轮只改变一个变量：角度、表情或动作，不能同时重设计毛色和纹样。

### 第四步：清理与绑骨

在 Photoshop、Clip Studio Paint、Procreate 或其他分层绘图软件中重画边缘、统一颜色、补齐被遮挡身体，再导入 Rive 绑骨。

### 第五步：手机验证

将角色分别缩放到 48 px、96 px、160 px、240 px，检查：

- 狐狸轮廓是否仍能识别。
- 金色纹样是否糊成一团。
- 眼睛是否仍有方向。
- 尾巴是否和身体分离。
- 透明边缘是否有白边或黑边。

## 9. 可直接复制的提示词

以下提示词用于外部图像生成软件。V2 锚点阶段同时上传两张参考图；锚点批准后，后续图纸只使用已批准的 V2 角色图，避免多张参考图互相争夺造型控制权。

### 9.1 角色锚点提示词

```text
Use case: stylized-concept
Asset type: original animated character identity anchor for a mobile knowledge app
Input images: Image 1: proportion and marking reference only; preserve the general quadruped proportions, stance logic and exactly three gold markings, but redraw rather than copy the flat vector style. Image 2: rim-light reference only; borrow the low warm-gold edge light direction, do not copy its background, framing or crop.
Primary request: refine and redraw an original semi-realistic 2D East Asian animated spirit fox named only by production code KT-FOX-01
Subject: an adult quadruped black fox, fox rather than wolf or coyote, with a slender agile torso, wedge-shaped fox muzzle, alert triangular ears, expressive amber almond-shaped eyes, defined elbows and hocks, four natural canine paws, and one full bushy fox tail that widens through the middle and tapers into a gentle inward curl
Character details: charcoal-black fur with subtle warm-gray chest and lower face; restrained antique-gold markings limited to exactly three places: a small sprout-shaped mark in the center of the forehead, a short branched line on the chest, and one fine arc near the tail tip; soft cheek ruff, throat fur, elbow fur and tail fur break the silhouette
Expression: calm, intelligent and quietly alive; iris about 10-12 percent larger than Image 1, one soft catchlight, relaxed upper eyelid, subtle neutral mouth line; not severe like a wolf and not cute like a puppy
Style/medium: polished hand-drawn 2D animated feature character, original design, dark clean ink lines, cel-shaded base with softly painted shadow transitions, visible fur grouping and subtle xuan-paper grain; more authored and expressive than flat vector illustration
Composition/framing: full body visible, three-quarter view facing screen left, asymmetrical natural stance with slight weight shift and one forepaw advanced, head turned a few degrees toward the viewer, entire ears and tail visible, no cropping
Lighting/mood: soft upper-left key light and a restrained warm-gold rim light along the right silhouette, atmospheric but still readable as a production character sheet
Color palette: ink black #1B1B18, charcoal #2A2923, muted antique gold #C6A15B, amber eyes #D99A3D, warm paper background #EDE4D2
Scene/backdrop: plain warm neutral studio background
Constraints: original character; clearly fox-like, not wolf-like; stable anatomy; one tail; exactly four legs; three gold markings only; no clothes; no human hands; no text; no logo; no watermark
Avoid: flat vector illustration, corporate mascot, stock character sheet, wolf face, coyote appearance, stiff symmetrical mannequin pose, tubular legs, ribbon-like tail, chibi, oversized head, 3D plush toy, anthropomorphic fox girl, cyborg, neon cyan, glowing armor, multiple tails, photorealistic fur, huge cute eyes, direct imitation of any existing animation studio, game or artist
```

### 9.2 四视图图纸提示词

```text
Use case: stylized-concept
Asset type: professional 2D character turnaround model sheet
Input images: Image 1: character identity reference; preserve its proportions, three gold markings and tail shape
Primary request: create a consistent character turnaround sheet for KT-FOX-01
Subject: the same adult black four-legged spirit fox shown in four separate orthographic views: front, three-quarter left, left profile, and rear
Style/medium: production animation model sheet, clean line art with flat cel colors, warm-paper background, precise and readable
Composition/framing: four full-body views at equal scale on one shared ground line, generous spacing, neutral standing pose, entire ears and tail visible
Lighting/mood: flat neutral reference lighting with only minimal form shadow
Color palette: #1B1B18 fur, #2A2923 highlights, #C6A15B markings, #D99A3D amber eyes
Constraints: exact same character in every view; identical head-to-body ratio; one tail; exactly three gold markings; no perspective distortion; no text; no labels; no watermark
Avoid: mismatched views, changing hairstyle or fur pattern, extra limbs, extra tails, costume, background scenery, poster lighting, chibi proportions
```

### 9.3 表情表提示词

```text
Use case: stylized-concept
Asset type: game-ready character expression sheet
Input images: Image 1: character identity reference; keep the exact same character design
Primary request: a 4-by-2 expression sheet for KT-FOX-01 with eight clearly different expressions: calm, curious, listening attentively, thinking, quietly delighted, worried apology, sleepy, determined
Style/medium: modern East Asian 2D animated character, cel shading, clean character sheet presentation
Composition/framing: eight head-and-shoulder portraits at identical scale and three-quarter angle, evenly spaced, no cropping
Constraints: express emotion through ears, eyelids, muzzle, head tilt and subtle neck posture; preserve fur shape, forehead sprout mark, chest branch mark and amber eyes; no text; no labels; no watermark
Avoid: human facial anatomy, exaggerated chibi eyes, changing colors, extra markings, different characters, backgrounds, props
```

### 9.4 动作表提示词

```text
Use case: stylized-concept
Asset type: animation pose sheet for a mobile companion character
Input images: Image 1: character identity reference; preserve exact design
Primary request: create six full-body action key poses for KT-FOX-01: quiet idle stand, seated and listening, four-legged run, low sniffing inspection, carrying one leaf-shaped paper token in the mouth, looking back while inviting the user to follow
Style/medium: production animation pose sheet, dynamic but readable silhouettes, 2D cel animation
Composition/framing: six separate full-body poses on a neutral warm-paper layout, equal scale, all paws and tail visible
Constraints: natural fox gait; one tail; exactly three gold markings; one small leaf-shaped token only in the carrying pose; no text; no labels; no watermark
Avoid: two-legged walking, human hands, clothes, armor, extra props, extreme perspective, motion blur, inconsistent anatomy, multiple tails
```

### 9.5 透明底待机主图提示词

```text
Use case: stylized-concept
Asset type: transparent production character cutout
Input images: Image 1: selected final character identity reference
Primary request: isolated full-body idle pose of KT-FOX-01, facing slightly left, calm and alert
Style/medium: final polished 2D animation character, clean silhouette, cel-shaded, subtle warm rim light
Composition/framing: centered full body, entire body including all paws, ears and tail, generous padding
Background: genuinely transparent background, clean alpha edges
Constraints: preserve the selected head-to-body ratio, face, three gold markings, four legs and single tail exactly; no ground shadow; no text; no watermark
Avoid: white halo, black fringe, cropped tail, extra limbs, background scenery, UI elements
```

### 9.6 通用负面提示词

```text
chibi, oversized head, plush toy, vinyl toy, 3D mascot, sticker icon, humanoid fox, fox girl, clothing, armor, human hands, cyborg, robot, neon glow, cyan lighting, multiple tails, extra legs, missing paw, asymmetrical ears, inconsistent gold markings, white fur, red fox, photorealistic fur, huge glossy eyes, generic anime poster, watermark, signature, logo, text, letters, UI, frame, low resolution, blurry edges, broken anatomy
```

## 10. 动画状态机

| 状态 | 触发 | 动作 | 退出 |
|---|---|---|---|
| `hidden` | 用户收起 | 只保留静态耳朵图标或关闭 | 用户重新展开 |
| `idle` | 无操作 3 秒 | 呼吸、眨眼、耳朵轻动、尾尖慢摆 | 输入、点击或线索出现 |
| `listen` | 输入框聚焦 | 耳朵前倾、头部微抬、身体静止 | 输入结束 |
| `think` | AI 整理中 | 坐下、尾巴收近身体、三次轻微眨眼 | 成功、失败或取消 |
| `lead` | 用户点击宠物入口 | 沿安全区跑向目标区域，停在不遮挡位置 | 用户点击目标按钮 |
| `carry` | 有 1–3 条待归类 | 叼着知识叶停在入口旁，最多一条气泡 | 用户打开或关闭提示 |
| `celebrate` | 保存或回顾完成 | 轻跳一次、尾巴回卷、最多六片金色小叶 | 0.9 秒后回到 idle |
| `error` | 网络或保存失败 | 耳朵后收、身体降低，配可操作错误信息 | 用户重试或关闭 |
| `sleep` | 30 秒无交互 | 伏下、闭眼、尾巴围住身体 | 任意点击后 0.4 秒唤醒 |

动作节奏：

- 待机循环 4–6 秒，呼吸幅度不超过身体高度的 2%。
- 眨眼使用 8–12 帧，不在所有循环中重复同一节奏。
- 屏幕内引导移动 600–800 毫秒。
- 成功后庆祝只播放一次，不复用为加载动画。
- 同一时间最多一条宠物气泡。
- 用户输入时不播放跑动、跳跃或庆祝。
- 任何连续主动提示间隔不少于 45 秒；同一会话不得反复催促。

## 11. Rive 分层与绑骨

源文件必须按以下层级分组，名称保持英文，方便动画程序读取：

```text
KT-FOX-01
├─ fx_shadow
├─ body_root
│  ├─ tail_root
│  │  ├─ tail_01
│  │  ├─ tail_02
│  │  ├─ tail_03
│  │  ├─ tail_04
│  │  ├─ tail_05
│  │  └─ tail_tip_mark
│  ├─ pelvis
│  ├─ torso
│  ├─ chest_mark
│  ├─ hind_leg_L
│  ├─ hind_leg_R
│  ├─ front_leg_L
│  ├─ front_leg_R
│  └─ neck_head
│     ├─ head
│     ├─ ear_L
│     ├─ ear_R
│     ├─ forehead_sprout_mark
│     ├─ eye_L
│     ├─ eye_R
│     ├─ muzzle
│     ├─ nose
│     └─ mouth_anchor
├─ prop_knowledge_leaf
└─ fx_particles
```

绑骨约束：

- 尾巴 5 段骨骼，最大弯曲 180 度。
- 四条腿各有上段、下段和脚掌控制。
- 耳朵各有独立旋转控制，最大前后 18 度。
- 眼睛使用双眼同步控制，另保留左右眼独立微调。
- 金色纹样不得跨越多段网格，避免动作时拉伸变形。
- 尾巴纹样作为独立网格跟随尾段。
- 知识叶有 `mouth` 和 `hover` 两个挂点。
- 粒子层可整体关闭，关闭后不影响角色状态。

## 12. 技术性能与无障碍

- 角色使用 Rive 或等价的骨骼动画格式，不加载整段视频作为循环待机。
- 首次加载目标不超过 1.5 MB；静态首帧不超过 40 KB。
- 4G 手机上首帧目标 300 毫秒内出现。
- 页面切换不得重复下载同一个角色文件。
- 角色动画运行在独立 Canvas 或等价的固定区域，不能引起整页布局抖动。
- 不播放动画时显示透明 WebP 静态图。
- 默认尊重 `prefers-reduced-motion`：只保留状态切换和不超过 150 毫秒的淡入淡出。
- 宠物入口必须有可聚焦的按钮语义、清晰标签和键盘等价入口。
- 气泡不能自动把焦点从输入框夺走。
- 屏幕阅读器不播报装饰性跑动，只播报可执行提示。
- 动画暂停或加载失败时，所有功能仍能通过普通导航完成。

## 13. 验收标准

### 13.1 静态设计

- 三视图头宽、肩高、腿长、尾长一致。
- 全身正好四条腿、一只尾巴、三组金色纹样。
- 48 px 缩略图仍能识别为狐狸。
- 眼睛没有人类睫毛或夸张卡通大眼。
- 角色不穿衣服、不拿手机、不使用人类手势。
- 金纹在三种主要姿态中位置一致。

### 13.2 动画

- 奔跑循环没有脚底滑步，四足节奏正确。
- 待机时耳朵、尾巴和呼吸不同步起止，避免机械感。
- 从右到左移动后角色朝向正确，不突然镜像金纹位置。
- 叼取知识叶时嘴部挂点稳定，知识叶不穿过头部。
- 切换状态不会出现跳帧、部件错位或尾巴断裂。
- 关闭动画后角色仍保持当前状态的可理解静态姿势。

### 13.3 产品行为

- 宠物不遮挡主要按钮、正文和输入框。
- 宠物入口点击后只打开流程，不直接执行写操作。
- 输入状态下不主动移动或弹气泡。
- 错误反馈可操作，不以宠物情绪代替明确错误信息。
- 用户可收起宠物，收起状态在刷新后保持。

## 14. 交付检查表

绘图软件交付时逐项确认：

- [ ] 已提供选定的角色锚点图。
- [ ] 已提供四视图，不带文字和背景场景。
- [ ] 已提供八组表情。
- [ ] 已提供至少九组动作关键姿态。
- [ ] 已提供透明底待机主图，无白边。
- [ ] 已提供分层 PSD 或同类源文件。
- [ ] 图层按照 Rive 层级命名。
- [ ] 已完成 48/96/160/240 px 缩略验证。
- [ ] 色值使用本文档规定值。
- [ ] 角色没有额外尾巴、腿部、纹样或服饰。
- [ ] 所有资产均为原创，不包含水印、签名和第三方 IP。

## 15. 参考图使用规则

V2 使用已选定的两张本地参考：

- `references/kt-fox-01_proportion-anchor-v1.jpeg`：标记为 `Image 1: proportion and marking reference`。保留四足比例、站姿逻辑和三处金纹，但必须重画成更生动的动画角色。不得复制它偏平的矢量画法、偏黑狼的脸和管状四肢。
- `references/kt-fox-01_rimlight-reference-v1.png`：标记为 `Image 2: rim-light reference`。只采用右后方暖金轮廓光。不得复制白底、裁切、构图或它的身体比例。

历史 `design/references/概念-03.jpg` 只保留为品牌气质归档。V2 不再把它加入生成参考，避免大头短身和 3D 玩偶质感重新混入。

## 16. 生产顺序

1. 上传第 15 节的两张参考图，使用第 9.1 节的 V2 提示词生成 4 个候选锚点。
2. 只保留“狐狸脸、蓬松尾巴、四肢关节和三处金纹”都成立的版本。
3. 把批准的 V2 锚点作为唯一角色参考，生成四视图与八组表情。
4. 继续使用 V2 锚点生成动作姿态，不重新设计角色。
5. 在分层绘图软件中清理和补图。
6. 完成 48 px 到 240 px 的可读性测试。
7. 按第 11 节分层，进入 Rive 绑骨。
8. 接入产品前完成状态机、性能和减少动态效果测试。
