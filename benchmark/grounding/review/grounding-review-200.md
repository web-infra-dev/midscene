| Testcase | Platform | Category | 修订意见 | 修订意见详细描述 |
| --- | --- | --- | --- | --- |
| [GUI-MOBILE100-factors-v1-023](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-023) | Mobile | Specialized Icon | 【考点可绕过】陌生图标主考点可被明确空间提示绕过 | 指令“A rounded square button with the DeepSearch icon, positioned between the paperclip and lightbulb buttons”同时给出了名称和明确空间关系。截图输入栏只有一个旋涡按钮位于回形针与灯泡之间，GT约[191,1387,291,1480]与此按钮一致；上方介绍卡还展示了相同旋涡图案及“DeepSearch”名称。因此按“between”锚点或图案对照即可命中，无需识别非常见图标所代表的功能；作为Specialized Icon主考点代表题存在类目效度问题，更接近相对位置/直接图形匹配。此项不是错GT，也不据静态图推断真实点击行为。 |
| [GUI-MOBILE100-factors-v1-032](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-032) | Mobile | Specialized Icon | - | - |
| [GUI-MOBILE100-factors-v1-034](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-034) | Mobile | Specialized Icon | - | - |
| [GUI-MOBILE100-factors-v1-035](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-035) | Mobile | Specialized Icon | - | - |
| [GUI-MOBILE100-factors-v1-039](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-039) | Mobile | Specialized Icon | - | - |
| [GUI-MOBILE100-factors-v1-043](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-043) | Mobile | Color Recognition | - | - |
| [GUI-MOBILE100-factors-v1-047](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-047) | Mobile | Color Recognition | 【考点可绕过】指令直接给出“第一行第二个”，可绕过颜色识别，Color Recognition 考点被位置提示泄露。 | 指令是“点击第一行第二个红色”，截图字体颜色面板第一行第二个圆形色样正是亮红色，GT [296,1495.0000000000002,418,1623] 对应它。第一行和第二个已经唯一确定目标，即使不判断红色也能按行列序数作答；因此命中GT不能说明模型识别了颜色。GT本身与该色样一致，问题在于作为Color Recognition样本的区分度，建议去掉足以直接锁定目标的序数条件，或改为相对/序数位置类任务。 |
| [GUI-MOBILE100-factors-v1-051](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-051) | Mobile | Color Recognition | - | - |
| [GUI-MOBILE100-factors-v1-052](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-052) | Mobile | Color Recognition | - | - |
| [GUI-MOBILE100-factors-v1-055](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-055) | Mobile | Color Recognition | - | - |
| [GUI-MOBILE100-factors-v1-056](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-056) | Mobile | Reasoning | 【考点代表性】对手名已唯一锁定目标，“未开始”条件的额外区分作用有限（GT正确）。 | 指令明确给出“China versus Cameroon youth team match that hasn't started yet”。截图中只有明天0:30的“中国U16 / 喀麦隆U16”包含该对手，且右侧确为“未开始”，GT [3.024,1480.986,1072.98,1686.906] 覆盖正确赛程行。对手名本身已经唯一锁定该行，因此“未开始”没有在本屏额外排除其他同对手比赛。参照Web对冗余筛选条件的记录，可复核其多条件/状态推理代表性；青年队/U16与比赛状态的语义理解仍是合理解法，不据此否定Reasoning或判GT错误。 |
| [GUI-MOBILE100-factors-v1-058](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-058) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-factors-v1-059](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-059) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-factors-v1-062](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-062) | Mobile | Reasoning | 【问题】需预先知道“金铲铲之战”与英雄联盟自走棋手游的关系，截图未提供对应依据。 | 指令要求“the mobile version of the League of Legends auto-chess game”。截图今日推荐中的目标条目只写“金铲铲之战”，副标题“登顶！赛博城市！”和“桌游榜·今日 TOP1”，未出现 League of Legends、英雄联盟、自走棋或手游版等解释。GT [33.048,1064.232,844.992,1257.282] 覆盖该应用图标与介绍。要从英文描述锁定中文专名，需具备游戏品牌及衍生产品知识；这超出仅据截图作条件推理，定位失败难以单独归因于 GUI 理解。 |
| [GUI-MOBILE100-factors-v1-065](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-065) | Mobile | Reasoning | 【考点代表性】单书页面的作者入口可直接识别，长背景条件的额外筛选作用有限（GT正确）。 | 指令要求查阅“创作了安博塞利国家公园象群故事的同一作者”的其他书。截图已经是《我们的旅程》的单书详情，简介确实提到象群，下面直接有“作者”标题和“孙霄”卡；GT [42.012,1639.872,763.02,1834.794] 正确覆盖作者卡。直接寻找当前书的作者入口即可定位，象群背景没有在本屏从多本书或多个作者中排除额外候选。可作为背景条件及跨对象关联强度的复核意见；从故事指代当前书与作者仍属于合法语义理解，不据此判定Reasoning分类错误。 |
| [GUI-MOBILE100-factors-v1-066](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-066) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-factors-v1-068](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-068) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-factors-v1-078](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-078) | Mobile | Fine-grained Manipulation | 【GT容差复核】当前游标框延伸到可见竖线下方空白，可复核精细点目标的统一容差。 | 指令定位色温滑杆当前刻度。GT [568,2117,602,2253] 为34×136像素，正确锁定中央黑色当前竖线的横向位置，但纵向下部延伸到可见竖线及刻度下方的空白。点落框计分会接受这部分留白，若希望Fine-grained Manipulation严格衡量局部精度，可对线状目标的统一容差做复核。该框可能是官方点定位容差，且仍限定在正确局部；没有统一容差标准或真实热区证据，不把框内有空白直接判为错GT，也不据此断言必须收紧。 |
| [GUI-MOBILE100-factors-v1-086](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-086) | Mobile | Fine-grained Manipulation | - | - |
| [GUI-MOBILE100-factors-v1-088](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-088) | Mobile | Fine-grained Manipulation | - | - |
| [GUI-MOBILE100-factors-v1-089](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-089) | Mobile | Relative Position | - | - |
| [GUI-MOBILE100-factors-v1-096](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-factors-v1-096) | Mobile | Relative Position | 【类目边界复核】通过设置行标题选择重复右箭头，兼有 Disambiguation 特征。 | 指令要求定位“Schedule Dark mode”行“Off”旁的图标，GT [964,1419,1042,1485] 正确指向该行右箭头。同屏Brightness level及Anti-flicker mode也有同形右箭头，后者同样显示Off；需要用具体行标题区分重复箭头。用户给出的类目说明注释将Relative Position与Disambiguation的差别定义为是否需要从重复元素中消歧，因此本题值得复核主类边界。另一方面，Schedule Dark mode行也可视为唯一复合空间锚点，且本地元数据已将Disambiguation列为次要因子；此处记录定义与主次类口径的交叉，不断言GT错误，也不擅自修改当前类目。 |
| [GUI-MOBILE100-v4p2-031](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-031) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-033](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-033) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-036](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-036) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p2-037](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-037) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-038](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-038) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-040](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-040) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-041](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-041) | Mobile | Functional | 【类目代表性】collected 与界面 Collections 同词根，主要依靠标签匹配，Functional 类目的功能推断区分度有限。 | 指令为“View the content collected by the user”，底部目标Tab直接写“Collections”，旁边还有书签符号；GT [635,2031,882,2190] 已包含图标与完整标签，定位范围没有明显错位。模型只需将collected匹配到Collections即可选择该Tab，无需根据缺少功能名称的控件推导用途。此处是类别代表性意见，不是指令不可完成或GT错误；若希望专门衡量功能意图推断，可换用不直接重复目标功能词根的描述或调整分类。 这是一项参照Web记录提出的考点代表性意见；Functional本身可以含有文字标签，此处不把普通翻译、有效功能定位或GT判为错误。 |
| [GUI-MOBILE100-v4p2-042](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-042) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-044](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-044) | Mobile | Small Target | 【问题】GT仅圈刷新图标，排除了同一“换一换”入口的文字；“trending topics”与所在“猜你想搜”区域也有语义偏差。 | 指令为“Change to a new set of trending topics”。截图中GT [679,256,738,310] 只包住“换一换”左边的刷新图标，紧邻文字被排除；指令没有要求必须点图标，因此正确理解刷新入口、却把点放在“换一换”文字上的答案仍会落在GT外。该入口在“猜你想搜”标题行，下方另有“猜你想看/抖音热榜”榜单，故把它称为trending topics也可能让模型转向下方热榜。静态截图不能证明文字与图标是否共享点击区，应核验真实控件范围后扩大GT或明确要求点击图标，并把指令改为刷新搜索建议一类准确含义。 |
| [GUI-MOBILE100-v4p2-045](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-045) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-046](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-046) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-048](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-048) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p2-049](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-049) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p2-050](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-050) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-053](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-053) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-054](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-054) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-057](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-057) | Mobile | Functional | 【类目代表性】目标直接标为 Ringtone，可通过文字匹配作答，Functional 区分度不足。 | 指令是“Change the incoming call ringtone”，截图右上设置卡标题直接显示“Ringtone”，并有电话图标和当前铃声“Mi (Remix)”。GT [554,451,1041,704] 覆盖该卡，目标无明显标注错误。但 ringtone 与 Ringtone 直接一致，且“incoming call”由电话图标进一步确认；定位该卡主要依靠目标文字匹配，无需从未明示的需求推断功能。参照 Web 中“目标 Tab 文案与指令基本对应”的口径，本题作为 Functional 的考察区分度有限。 这是一项参照Web记录提出的考点代表性意见；Functional本身可以含有文字标签，此处不把普通翻译、有效功能定位或GT判为错误。 |
| [GUI-MOBILE100-v4p2-060](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-060) | Mobile | Functional | 【问题】“Daily check-in”有两个可见合理入口，GT 只接受右上角“日签”。 | 指令仅为“Daily check-in”。截图右上有日历勾选图标及“日签”，下方“更多功能”区域右下另有“签到领福利”入口，二者都与每日签到语义相符。GT [761,113,935,188] 仅覆盖右上“日签”，排除下方“签到领福利”。指令没有限定入口位置，也没有说明要日签而非福利签到；仅凭截图无法确认两入口是否通向相同功能，但下方入口是明确可见的合理候选，选它将因框外而被判错。 |
| [GUI-MOBILE100-v4p2-061](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-061) | Mobile | Functional | 【类目代表性】“incognito search”与“无痕搜索模式”直接对应，更接近基础文字定位。 | 指令为“Enable incognito search”，截图底部完整显示“无痕搜索模式”，右侧开关当前关闭；GT [895,2081,1036,2174] 覆盖该开关，状态及标注相符。incognito search 与“无痕搜索”是普通中英文等义表达，不需要根据意图推断隐藏的功能入口。问题不在跨语言本身，而在目标标签直接提供了所需功能名称：按 Web 同类口径，它作为 Functional 对功能推断的区分度有限，更适合基础文字定位。 这是一项参照Web记录提出的考点代表性意见；Functional本身可以含有文字标签，此处不把普通翻译、有效功能定位或GT判为错误。 |
| [GUI-MOBILE100-v4p2-063](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-063) | Mobile | Functional | 【类目代表性】“Avoid restricted traffic zones”与“避开限行”直接等义，功能推断考点较弱。 | 指令为“Avoid the city's restricted traffic zones.”，截图中完整文字“避开限行”右侧即为关闭开关，GT [879,1319,1018,1402] 与开关一致，状态也允许开启。用户可直接将 avoid 对应“避开”、restricted traffic 对应“限行”并选取唯一同名开关，无需从页面其他功能推断实现途径。与 Web 直接匹配功能 Tab 的口径一致，问题是 Functional 分类区分度不足，而非正常中英翻译有误。 这是一项参照Web记录提出的考点代表性意见；Functional本身可以含有文字标签，此处不把普通翻译、有效功能定位或GT判为错误。 |
| [GUI-MOBILE100-v4p2-064](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-064) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p2-067](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-067) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-069](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-069) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-070](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-070) | Mobile | Functional | - | - |
| [GUI-MOBILE100-v4p2-071](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-071) | Mobile | Reasoning | 【指令与GT范围】“recently”未定义时间窗口；GT还包含独立的三点菜单。 | 指令为“View recently updated videos”，没有限定“最近”的时间窗口，也没有明确要求最新一条。截图第二条标“12小时前”，第三条“2天前”，其余条目标“8月8日”；GT [32,914,1049,1197] 只指定12小时前条目。12小时前确是可见列表中最新，但2天前也可能被理解为近期，建议明确时间范围或写most recently updated以使目标唯一。此外，GT覆盖整条视频卡，清晰可见的UP主区域和右下独立三点菜单也在框内；点落这些区域也会按规则计为命中，未必是在定位视频主体。建议核对标注是否应限定图片/标题；仅凭静态截图不推断各区域实际点击后的行为。 |
| [GUI-MOBILE100-v4p2-072](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-072) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p2-073](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-073) | Mobile | Reasoning | 【目标粒度】要求定位新闻图片，GT却覆盖来源、标题和股票代码所在的整张卡片。 | 指令明确要求“check the news images of stocks with rising prices”。截图目标新闻卡为“SoftBank to invest $2 billion in Intel”，同时显示 SFTBF +1.34% 与 INTC -3.66%，右侧有一张SoftBank缩略图。GT [49,694,1022,1067] 包围新闻来源、标题、缩略图及股票代码整卡，远大于图片本身；预测点落在Reuters文字、标题或股票代码上也会被计为正确，不能验证它定位了“news images”。目标卡包含上涨股票，本身并不因同时存在下跌股票而错误；问题在要求图片与允许整卡的粒度不一致。建议将指令改为选择含上涨股票的新闻卡，或将GT收紧到对应图片并明确目标。 |
| [GUI-MOBILE100-v4p2-080](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-080) | Mobile | Reasoning | 【考点代表性】题材文字已唯一定位目标，播放量条件的额外区分作用有限（GT正确）。 | 目标标题直接包含“搞笑&amp;修仙”，播放量453.6万也符合&gt;450万；GT正确指向其播放键。当前可见干扰项中没有同题材但不满足门槛的条目，因此无需同时使用播放量条件也能定位。此项宜视为多条件关联类的代表性意见，而非标注错误。 GT坐标为[1122,1551,1225,1654]。 |
| [GUI-MOBILE100-v4p2-085](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-085) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p2-090](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-090) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p2-092](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-092) | Mobile | Refusal | - | - |
| [GUI-MOBILE100-v4p2-093](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-093) | Mobile | Refusal | - | - |
| [GUI-MOBILE100-v4p2-095](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-095) | Mobile | Refusal | - | - |
| [GUI-MOBILE100-v4p2-099](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-099) | Mobile | Refusal | - | - |
| [GUI-MOBILE100-v4p2-100](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p2-100) | Mobile | Refusal | - | - |
| [GUI-MOBILE100-v4p3-001](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-001) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-002](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-002) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-003](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-003) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-004](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-004) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-005](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-005) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-006](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-006) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-007](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-007) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-008](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-008) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p3-009](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-009) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-010](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-010) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-011](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-011) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-012](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-012) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p3-013](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-013) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-014](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-014) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-015](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-015) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-019](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-019) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-020](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-020) | Mobile | Functional | 【指令用词】把 messages 误写成 massages；当前指令字面含义不是“消息”。 | 原始指令是“display flagged massages”。截图为聊天列表，顶部有“Chats / Unread 1 / Flagged”，GT [621,252,910,386] 正确覆盖 Flagged Tab。此语境下目标应为显示已标记消息，英文应使用 messages；massages 表示“按摩”，属于原指令用词错误。模型可借助 flagged 和界面上下文纠正拼写后定位，但这额外引入了纠错要求。建议将原句改为“Display flagged messages”；本条没有认定GT位置错误。 |
| [GUI-MOBILE100-v4p3-021](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-021) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-022](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-022) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-024](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-024) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-026](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-026) | Mobile | Element basic | 【问题】指令所称白色矩形框和红色圆形“11”徽标，与实际站点标记的外观不一致。 | 指令描述“A white rectangular box”以及“a red circular badge with the number 11”。截图中“龙耀路”站名、左侧地铁符号和下方11号线标记分散叠在地图上，没有包住三者的白色矩形卡片；“11”实际位于深红色圆角矩形中，不是圆形。GT [216,1150,366,1230] 覆盖的确是龙耀路站标记，站名和线路号能唯一指向它，但严格按指令外观找目标的模型可能因矩形框/圆形条件不符而拒绝或偏离。建议修正外观描述，保留直接可见的站名和线路号，不据此判定GT位置错。 |
| [GUI-MOBILE100-v4p3-027](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-027) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p3-028](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-028) | Mobile | Disambiguation | - | - |
| [GUI-MOBILE100-v4p3-029](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-029) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p3-030](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p3-030) | Mobile | Element basic | - | - |
| [GUI-MOBILE100-v4p5-016](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p5-016) | Mobile | Disambiguation | - | - |
| [GUI-MOBILE100-v4p5-017](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p5-017) | Mobile | Disambiguation | - | - |
| [GUI-MOBILE100-v4p5-018](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p5-018) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p5-025](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p5-025) | Mobile | Small Target | - | - |
| [GUI-MOBILE100-v4p6-094](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p6-094) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p6-097](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p6-097) | Mobile | Reasoning | 【考点代表性】健身房卡自带名称，Free属性的额外筛选作用有限（GT正确）。 | 上方Fitness Room明确标Free，下方目标卡也标Fitness Room且展示健身器材，GT正确。只按workout space的语义匹配即可找到该卡，无需再核对Free；可作为多条件关联子类的代表性意见。语义理解本身符合当前Reasoning定义。 GT坐标为[70,1707,496,2021]。 |
| [GUI-MOBILE100-v4p7-074](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-074) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p7-075](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-075) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p7-076](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-076) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p7-077](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-077) | Mobile | Reasoning | - | - |
| [GUI-MOBILE100-v4p7-081](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-081) | Mobile | Relative Position | - | - |
| [GUI-MOBILE100-v4p7-082](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-082) | Mobile | Relative Position | - | - |
| [GUI-MOBILE100-v4p7-087](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-087) | Mobile | Fine-grained Manipulation | - | - |
| [GUI-MOBILE100-v4p7-091](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-091) | Mobile | Fine-grained Manipulation | 【GT容差复核】柱顶框包含柱体两侧及上方空白，可复核精细点目标的统一容差。 | 指令选择06:00至12:00时段柱子的顶端。GT [439,929,508,1007] 为69×78像素，覆盖正确橙色柱顶，也包含柱体两侧和上方白底；它仍是图表内很小的局部，未圈入其他柱或整张图。参照Web精细定位范围的记录，可复核柱顶目标的容差是否符合项目希望的严格度。点目标用矩形容差本身合理，静态图也未提供统一容差规范，因此此项仅为GT容差复核意见，不作为已确认标注错误。 |
| [GUI-MOBILE100-v4p7-098](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p7-098) | Mobile | Disambiguation | - | - |
| [GUI-MOBILE100-v4p8-079](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p8-079) | Mobile | Disambiguation | - | - |
| [GUI-MOBILE100-v4p8-083](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p8-083) | Mobile | Relative Position | 【考点代表性】唯一章节标题允许绕过第四项计数，相对位置考点的独立区分度有限。 | 第四项确为CUDA Core Design且GT覆盖正确章节。指令同时给出唯一标题，因此按文字匹配也能命中，无需执行序数定位。可作为Relative Position主考点代表性意见；并非目标或GT错误。 GT坐标为[28,2045,1262,2347]。 |
| [GUI-MOBILE100-v4p8-084](http://127.0.0.1:4318/output/case-browser/index.html#GUI-MOBILE100-v4p8-084) | Mobile | Reasoning | - | - |
| [GUI-WEB100-factors-v1-003](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-003) | Web | Element basic | - | - |
| [GUI-WEB100-factors-v1-023](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-023) | Web | Specialized Icon | - | - |
| [GUI-WEB100-factors-v1-025](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-025) | Web | Specialized Icon | 待评审 | 【类目映射说明】本题指令为商品信息下方的灰色 comparison/price history 图标，对应原表「第二个历史价格的倒是难度不大」。此处保留难度评价，原反馈没有指出本题的指令或 GT 错误。 |
| [GUI-WEB100-factors-v1-034](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-034) | Web | Specialized Icon | 待评审 | 【类目映射说明】本题目标是 Transformation layout 图标，来源为 MedSPOT / BlueLight，对应原表「后面三个专业超声影像的界面」之一。原表类目意见全文：有点不知道怎么评，确实不常见，我都有点不会，第一个 GitHub 的 case 挺好的，第二个历史价格的倒是难度不大，后面三个专业超声影像的界面，确实不常见，但确实一般人都不会去操作这样的界面。看看是不是有别的 case 可以替代，实在不行，就超声影像这种专业界面吧，不过换张图，别三个都是超声影像。原类目行未填写问题详情，此处仅说明逐题映射，不新增本题标注错误的结论。 |
| [GUI-WEB100-factors-v1-039](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-039) | Web | Specialized Icon | 待评审 | 【类目映射说明】本题目标是 color invert 图标，来源为 MedSPOT / BlueLight，对应原表「后面三个专业超声影像的界面」之一。原表类目意见全文：有点不知道怎么评，确实不常见，我都有点不会，第一个 GitHub 的 case 挺好的，第二个历史价格的倒是难度不大，后面三个专业超声影像的界面，确实不常见，但确实一般人都不会去操作这样的界面。看看是不是有别的 case 可以替代，实在不行，就超声影像这种专业界面吧，不过换张图，别三个都是超声影像。原类目行未填写问题详情，此处仅说明逐题映射，不新增本题标注错误的结论。 |
| [GUI-WEB100-factors-v1-041](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-041) | Web | Specialized Icon | 待评审 | 【类目映射说明】本题目标是 Measurement layout 图标，来源为 MedSPOT / BlueLight，对应原表「后面三个专业超声影像的界面」之一。原表类目意见全文：有点不知道怎么评，确实不常见，我都有点不会，第一个 GitHub 的 case 挺好的，第二个历史价格的倒是难度不大，后面三个专业超声影像的界面，确实不常见，但确实一般人都不会去操作这样的界面。看看是不是有别的 case 可以替代，实在不行，就超声影像这种专业界面吧，不过换张图，别三个都是超声影像。原类目行未填写问题详情，此处仅说明逐题映射，不新增本题标注错误的结论。 |
| [GUI-WEB100-factors-v1-046](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-046) | Web | Reasoning | 地图是中文的，指令中地名是英文的 | 指令使用 Wensan Road，地图标注为“文三路”，未提供中英文对照。模型需先对应英文站名与中文锚点，再结合蓝色、橙色线路的交汇关系定位换乘图标。与 case 009、020 同属跨语言地名对应风险；Wensan 是拼音、Road 对应“路”，映射相对直接，但仍混入了站名识别要求，不能把失败单独归因于线路与空间推理。 |
| [GUI-WEB100-factors-v1-048](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-048) | Web | Reasoning | - | - |
| [GUI-WEB100-factors-v1-050](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-050) | Web | Reasoning | 依赖机器学习领域知识，普通人不知道 | 指令要求打开“使用多个处理层的机器学习技术”的 wiki 页面，预期目标是 Hyponyms 下的 deep learning 链接。截图未解释多个处理层与深度学习的关系，用户必须具备相关背景知识，才能先完成概念识别再定位链接。因此该题混合了机器学习知识与界面定位能力，难以模拟普通用户仅凭界面完成任务的场景；它可以面向专业用户，但不宜作为普通用户的通用推理样本。此外，multiple processing layers 的表述较笼统，不如“多层神经网络”明确。 |
| [GUI-WEB100-factors-v1-052](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-052) | Web | Reasoning | 依赖玩具品牌背景知识，普通人不知道 | 指令要求筛选出“以积木玩具和人偶闻名的公司”生产的喷火龙商品，预期操作是勾选左侧 Brand 下的 MEGA。指令没有直接给出品牌名称，截图也未明确说明该描述与 MEGA 的对应关系。用户需要事先知道 MEGA 是玩具品牌，并了解其产品特点，才能推断出筛选目标；很多普通用户并不具备这些知识。同时，“以积木玩具和人偶闻名”的描述不够具体，难以唯一指向 MEGA。因此，操作虽然只是勾选品牌，实际难点却在于品牌背景知识，答错难以归因于界面理解或操作能力。 |
| [GUI-WEB100-factors-v1-054](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-054) | Web | Fine-grained Manipulation | - | - |
| [GUI-WEB100-factors-v1-058](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-058) | Web | Relative Position | - | - |
| [GUI-WEB100-factors-v1-060](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-060) | Web | Relative Position | - | - |
| [GUI-WEB100-factors-v1-063](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-063) | Web | Relative Position | - | - |
| [GUI-WEB100-factors-v1-065](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v1-065) | Web | Relative Position | - | - |
| [GUI-WEB100-factors-v2-042](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v2-042) | Web | Color Recognition | - | - |
| [GUI-WEB100-factors-v2-044](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v2-044) | Web | Color Recognition | 色块下方直接标注颜色名称，可通过文字匹配作答，无法有效考察颜色识别。 | 指令要求点击“Forest Green”圆形色块，页面三个色块下方分别标注 Brushed Navy、Silver Steel 和 Forest Green，目标色块的英文标签与指令完全一致。模型只需匹配 Forest Green 文字，再定位其上方的圆形色块，无需根据色块本身的视觉颜色区分选项。因此，该用例虽然被归为 Color Recognition，正确作答并不能说明模型具备相应的颜色识别能力。 |
| [GUI-WEB100-factors-v2-045](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v2-045) | Web | Color Recognition | - | - |
| [GUI-WEB100-factors-v3-053](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v3-053) | Web | Fine-grained Manipulation | - | - |
| [GUI-WEB100-factors-v3-056](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v3-056) | Web | Fine-grained Manipulation | - | - |
| [GUI-WEB100-factors-v3-057](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v3-057) | Web | Fine-grained Manipulation | “左下角”指代有歧义，GT 范围偏大，难以有效考察精细操作。 | 指令要求找到画布上图片的左下角，但截图对象是不规则矢量图形，预期目标是蓝色矩形选框左下角的缩放手柄。图形轮廓与选框并不重合，指令未明确区分图形本身的左下方与选框角点，存在指代歧义。此外，GT 为 77×62 像素，明显大于可见手柄，包含附近空白区域；命中该框不代表能实际拖动缩放。原始后续任务是向左下方放大到两倍，当前用例只保留角点定位，没有验证拖动或缩放结果，因此更接近局部位置定位，不能据此证明精细操作能力。 |
| [GUI-WEB100-factors-v3-079](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-factors-v3-079) | Web | Fine-grained Manipulation | - | - |
| [GUI-WEB100-v4p2-001](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-001) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-002](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-002) | Web | Reasoning | 仅凭 14:00 发车即可唯一定位，到达时间条件未起筛选作用。 | 截图可见发车时间为 14:00、14:16、14:43、15:00、15:21。唯一的 14:00 车次于 18:35 到达，模型只需将 2 p.m. 对应到 14:00，再定位该行“订”按钮。“20:00 前到达”仅作补充验证。现有理由“不能只匹配单一字段”与截图不符。 |
| [GUI-WEB100-v4p2-004](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-004) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-005](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-005) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-010](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-010) | Web | Disambiguation | 指令只要求找到股票，GT 却仅覆盖股票代码，目标区域限定过窄。<br><br>待评审 | 指令要求找到 RSI 为 53.78、Mom 为 0.78 的股票，截图中对应 CSCO（Cisco Systems, Inc.）。GT 仅圈住 CSCO 股票代码，不包含旁边的公司名称或该行其他区域。指令没有明确要求点击股票代码，因此用户即使正确识别了目标股票，将定位点放在公司名称等同一股票的区域也会落在 GT 之外。指令对目标的描述与标注允许的定位范围不一致。 |
| [GUI-WEB100-v4p2-011](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-011) | Web | Reasoning | gt 仅覆盖了股票代码的位置，但指令要求的查看股票详情可能，不一定是点击股票代码，点股票那一行也可以应该（我对这个界面不熟悉，所以不清楚），但指令可以明确为点击股票代码。 | 截图主表明确有 Market cap 与 Price 列；市值超过 1T 的四行是 NVDA（4.42T / 181.81 USD）、AAPL（3.67T / 247.45 USD）、AVGO（1.67T / 354.15 USD）、TSM（1.24T / 299.84 USD），因此最低 Price 为 NVDA，价格列本身无明显歧义。GT [314,470,420,518] 仅圈 NVDA 代码；仅凭静态截图不能确认公司名称或整行其他区域是否也可打开详情。模型可能选对股票却因合理点击位置在框外而被判错。 |
| [GUI-WEB100-v4p2-012](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-012) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-013](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-013) | Web | Disambiguation | 待评审 | 【类目映射说明】本题属于 Web「重复元素消歧」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题偏推理；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p2-014](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-014) | Web | Color Recognition | - | - |
| [GUI-WEB100-v4p2-015](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-015) | Web | Color Recognition | - | - |
| [GUI-WEB100-v4p2-016](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-016) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-017](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-017) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-018](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-018) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p2-020](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-020) | Web | Reasoning | 地图是中文的，指令中地名是英文的 | 指令使用 Tianqiao Performing Arts，地图标注为“天桥演艺”，未提供中英文对照。模型需先完成地名对应，再判断酒店售罄状态及距离。与 case 009 的震旦国际大楼类似，跨语言专名映射引入了额外要求，答错难以单独归因于地图推理。此处 Tianqiao 是“天桥”的拼音、Performing Arts 与“演艺”有语义对应，比 Aurora → 震旦更容易推断，但仍增加了指令与地图标注之间的识别步骤。 |
| [GUI-WEB100-v4p2-021](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-021) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-022](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-022) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-024](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-024) | Web | Functional | 路线规划存在多个合理的候选入口（地图上杭州东站上的标签右侧也有个按钮），GT 只覆盖左侧“去这里”按钮。 | 指令要求“Plan a route to Hangzhou East Railway Station”，没有限定使用哪个入口。GT 仅覆盖左侧杭州东站详情卡中的“去这里”按钮，而地图中央“杭州东站”标签右侧也显示路线箭头图标，用户同样可能将其理解为前往该站的路线规划入口。仅凭截图无法确认两者功能是否相同，但指令没有提供区分这两个候选入口的依据；若地图上的图标也能完成路线规划，点击它会因落在 GT 外而被判错。 |
| [GUI-WEB100-v4p2-028](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-028) | Web | Functional | 指令与目标 Tab 文案基本对应，主要依靠文字匹配，功能推断难度不足。 | 指令为“View an overview of note-related data”，目标 Tab 为“笔记数据总览”。note、data、overview 与“笔记”“数据”“总览”基本一一对应，模型通过简单的中英文语义匹配即可定位目标，无需根据操作意图进一步推断控件功能。作为 Functional 类用例，该题更接近基础文字定位，对功能理解能力的区分度有限。 |
| [GUI-WEB100-v4p2-029](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-029) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-030](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-030) | Web | Small Target | 支付宝已处于选中状态，指令却要求点击选中，与当前界面状态不一致。<br><br>待评审 | 指令为“Click to select Alipay payment”，GT 指向支付宝左侧的勾选框，但截图中该框已经呈橙色并显示勾号，表明支付宝已被选中。当前状态已满足选择支付宝的要求，无需再次点击；如果该控件支持勾选切换，再次点击反而会取消选中，与指令要求相反。该题忽略了控件的初始状态，无法准确表达这次点击应实现的状态变化。 |
| [GUI-WEB100-v4p2-031](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-031) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-032](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-032) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-033](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-033) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-035](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-035) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-036](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-036) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-037](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-037) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-038](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-038) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p2-040](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-040) | Web | Functional | 指令是“生成项目报告”，进入 Reporting 页面并不一定意味着生成报告，且目标可通过文字直接匹配。 | 指令为“Generate project report”，GT 却覆盖左侧“Reporting”导航入口。该入口可以是生成报告流程的第一步，但定位并点击它仅表达进入报告功能，不能据此认定已生成项目报告；指令描述的完整任务与单步标注目标不在同一层级。此外，report 与 Reporting 在文字和语义上直接对应，即使把意图改为进入报告页面，也主要是基础文字定位，作为 Functional 用例，对功能推断能力的区分度有限。 |
| [GUI-WEB100-v4p2-047](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-047) | Web | Functional | 左侧“我的消息”与右上角“消息”均符合指令含义，目标入口存在歧义。 | 指令仅为“View user messages”，GT 覆盖消息中心左侧的“我的消息”。页面右上角同时有信封图标及“消息”文字，也是查看消息的合理候选入口。指令未限定从消息中心侧栏进入，也未明确区分这两个控件，用户选择右上角“消息”同样符合对指令的自然理解，却会因落在 GT 之外而被判错。 |
| [GUI-WEB100-v4p2-049](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-049) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-051](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-051) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-055](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-055) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-059](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-059) | Web | Functional | - | - |
| [GUI-WEB100-v4p2-062](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-062) | Web | Refusal | - | - |
| [GUI-WEB100-v4p2-064](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-064) | Web | Refusal | - | - |
| [GUI-WEB100-v4p2-068](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-068) | Web | Refusal | - | - |
| [GUI-WEB100-v4p2-069](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-069) | Web | Refusal | - | - |
| [GUI-WEB100-v4p2-070](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p2-070) | Web | Refusal | - | - |
| [GUI-WEB100-v4p3-006](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p3-006) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p3-019](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p3-019) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-026](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-026) | Web | Functional | 界面未用文字明确品牌和桌面客户端信息，对不熟悉 Spotify 的用户不够直观。（不过本身下载指令倒是没什么歧义） | 指令要求下载 Spotify 桌面客户端，GT 对应顶部“安装应用”入口。截图左上角显示 Spotify Logo，但没有明确的 Spotify 品牌名称文字，按钮也未注明安装的是桌面客户端。不熟悉该 Logo 或产品界面的用户，难以仅凭截图确认当前服务的品牌，以及安装应用与下载 Spotify 桌面客户端之间的对应关系。不过，仍可根据指令中的客户端需求与顶部“安装应用”推断目标，品牌知识并非完成操作的必要条件。 |
| [GUI-WEB100-v4p4-027](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-027) | Web | Functional | - | - |
| [GUI-WEB100-v4p4-043](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-043) | Web | Functional | - | - |
| [GUI-WEB100-v4p4-071](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-071) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-072](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-072) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-073](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-073) | Web | Small Target | 指令把单选框（radio button）误称为复选框（checkbox）。<br><br>待评审 | 指令要求定位 Distance units 下的“Automatic” checkbox，但截图中 Automatic、miles、km 使用圆形单选控件，Automatic 以圆点显示选中状态。旁边 Avoid 区域的 Highways、Tolls、Ferries 才是方形复选框。指令对目标控件类型的描述与界面不符，混淆了单选与多选控件。 |
| [GUI-WEB100-v4p4-074](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-074) | Web | Disambiguation | 待评审 | 【类目映射说明】本题属于 Web「重复元素消歧」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题偏推理；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p4-075](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-075) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-076](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-076) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p4-077](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-077) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-078](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-078) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-080](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-080) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p4-081](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-081) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-082](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-082) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-083](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-083) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p4-084](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-084) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p4-085](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-085) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-086](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-086) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-088](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-088) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p4-089](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-089) | Web | Element basic | 指令未明确要求直接点击地球图片，用户可能选择下方的 Earth (Q2) 文字链接。 | 指令为“open the picture of earth”，页面同时显示地球图片和下方的 Earth (Q2) 文字链接，GT 仅覆盖图片区域，不包含文字链接。“picture”倾向于指向图片，但“open”描述的是打开目标，没有明确指定直接点击图片本身，用户可能将下方的 Earth (Q2) 链接理解为进入该目标的入口。因此，指令对点击位置的限定不够明确，而标注只接受图片区域。 |
| [GUI-WEB100-v4p4-091](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-091) | Web | Element basic | GT 框偏大了一点 | GT 标注范围偏大，未紧贴目标元素，可能使落在目标元素之外、但仍在框内的点击也被判为正确，降低定位评测的准确性。 |
| [GUI-WEB100-v4p4-092](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-092) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-093](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-093) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-094](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-094) | Web | Element basic | - | - |
| [GUI-WEB100-v4p4-098](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-098) | Web | Element basic | 图片较模糊，不过还在可辨认的范围内，我也在纠结这种图片模糊的用例是否我们要刻意排除掉？ | 截图清晰度不足，界面文字及元素细节较难辨认，增加了理解指令和定位目标的难度。识别或定位失败可能受到图片质量影响，难以单独反映模型的界面理解能力。 |
| [GUI-WEB100-v4p4-099](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-099) | Web | Element basic | 同图片模糊 | 截图清晰度不足，界面文字及元素细节较难辨认，增加了理解指令和定位目标的难度。识别或定位失败可能受到图片质量影响，难以单独反映模型的界面理解能力。 |
| [GUI-WEB100-v4p4-100](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p4-100) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p5-087](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p5-087) | Web | Element basic | 指令存在指代歧义，未区分“Picture of the day”标题与下方图片。 | 页面同时显示“Picture of the day”栏目标题和其下方的雪景图片，指令仅要求“click on the picture of the day”。用户既可能将其理解为点击每日图片本身，也可能按页面上的同名文字定位到栏目标题。GT 仅覆盖雪景图片，不包含标题文字，因此两种理解会导向不同的点击位置，而指令没有明确说明应点击标题下方的图片。 |
| [GUI-WEB100-v4p5-096](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p5-096) | Web | Disambiguation | 待评审 | 【类目映射说明】本题属于 Web「重复元素消歧」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题偏推理；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p5-097](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p5-097) | Web | Relative Position | - | - |
| [GUI-WEB100-v4p6-090](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p6-090) | Web | Small Target | 待评审 | 【类目映射说明】本题属于 Web「小目标」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题的目标尺寸过大；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p6-095](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p6-095) | Web | Element basic | - | - |
| [GUI-WEB100-v4p7-061](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p7-061) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p7-066](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p7-066) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p7-067](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p7-067) | Web | Disambiguation | 待评审 | 【类目映射说明】本题属于 Web「重复元素消歧」，承接原表对该类目的整体意见。原类目行未填写问题详情，也未逐题断定本题偏推理；此处仅将类目意见关联到本题。 |
| [GUI-WEB100-v4p8-007](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p8-007) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p8-008](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p8-008) | Web | Reasoning | - | - |
| [GUI-WEB100-v4p8-009](http://127.0.0.1:4318/output/case-browser/index.html#GUI-WEB100-v4p8-009) | Web | Reasoning | 地图是中文的，但指令中描述的地点英文的，需要模型脑子里有「Aurora Intl Building」表示的是震旦国际大楼这个知识，有点苛求。设计地名类的指令，地名的描述应该和地图地名一致。 | 地图仅显示“震旦国际大楼”，未提供 Aurora 中英文对照。模型需先完成专名映射，再比较距离，GT 为附近 US$1,342 价格牌。[震旦官方品牌说明](https://aurora.com.cn/_aurora/about-aurora)支持 Aurora 与震旦的品牌对应，但不能据此断言所有模型都掌握该地标；答错可能源于专名知识不足，而非空间推理失败。另：hotel for sale 易被理解为“出售的酒店”。 |
