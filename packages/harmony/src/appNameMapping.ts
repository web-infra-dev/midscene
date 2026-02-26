/**
 * App Name Mapping for HarmonyOS
 *
 * Maps friendly app names to their bundle names on HarmonyOS.
 * Keys are normalized (case-insensitive, ignoring spaces/dashes/underscores) during merge.
 */
export const defaultAppNameMapping: Record<string, string> = {
  // System apps
  设置: 'com.huawei.hmos.settings',
  Settings: 'com.huawei.hmos.settings',
  相机: 'com.huawei.hmos.camera',
  Camera: 'com.huawei.hmos.camera',
  图库: 'com.huawei.hmos.photos',
  Gallery: 'com.huawei.hmos.photos',
  日历: 'com.huawei.hmos.calendar',
  Calendar: 'com.huawei.hmos.calendar',
  时钟: 'com.huawei.hmos.clock',
  Clock: 'com.huawei.hmos.clock',
  计算器: 'com.huawei.hmos.calculator',
  Calculator: 'com.huawei.hmos.calculator',
  文件管理: 'com.huawei.hmos.filemanager',
  备忘录: 'com.huawei.hmos.notepad',
  联系人: 'com.huawei.hmos.contacts',
  电话: 'com.huawei.hmos.phone',
  信息: 'com.huawei.hmos.message',
  邮件: 'com.huawei.hmos.email',
  浏览器: 'com.huawei.hmos.browser',
  Browser: 'com.huawei.hmos.browser',
  应用市场: 'com.huawei.appmarket',
  AppGallery: 'com.huawei.appmarket',
  华为音乐: 'com.huawei.hmos.music',
  华为视频: 'com.huawei.hmos.video',
  天气: 'com.huawei.hmos.weather',
  Weather: 'com.huawei.hmos.weather',

  // Common third-party apps
  微信: 'com.tencent.mm',
  WeChat: 'com.tencent.mm',
  支付宝: 'com.eg.android.AlipayGphone',
  淘宝: 'com.taobao.taobao',
  京东: 'com.jingdong.app.mall',
  抖音: 'com.ss.hm.ugc.aweme',
  小红书: 'com.xingin.xhs',
  bilibili: 'tv.danmaku.bili',
  QQ: 'com.tencent.mobileqq',
  微博: 'com.sina.weibo',
  高德地图: 'com.autonavi.minimap',
  百度地图: 'com.baidu.BaiduMap',
  美团: 'com.sankuai.meituan',
  饿了么: 'me.ele',
  飞书: 'com.ss.android.lark',
  豆包: 'com.larus.nova',
  网易云音乐: 'com.netease.cloudmusic',
  QQ音乐: 'com.tencent.qqmusic',
  知乎: 'com.zhihu.android',
  今日头条: 'com.ss.android.article.news',
  Keep: 'com.gotokeep.keep',
};
