/**
 * App Name Mapping for Android
 *
 * This file contains mappings from friendly app names to their package names.
 * Keys are normalized (case-insensitive, ignoring spaces/dashes/underscores) during merge,
 * so only one canonical form of each app name is needed.
 *
 * Source: https://github.com/zai-org/Open-AutoGLM
 * Licensed under the Apache License 2.0
 *
 * Copyright (c) 2024 ZAI Organization
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export const defaultAppNameMapping: Record<string, string> = {
  // Chinese apps
  微信: 'com.tencent.mm',
  QQ: 'com.tencent.mobileqq',
  微博: 'com.sina.weibo',
  淘宝: 'com.taobao.taobao',
  京东: 'com.jingdong.app.mall',
  拼多多: 'com.xunmeng.pinduoduo',
  淘宝闪购: 'com.taobao.taobao',
  京东秒送: 'com.jingdong.app.mall',
  小红书: 'com.xingin.xhs',
  豆瓣: 'com.douban.frodo',
  知乎: 'com.zhihu.android',
  高德地图: 'com.autonavi.minimap',
  百度地图: 'com.baidu.BaiduMap',
  美团: 'com.sankuai.meituan',
  大众点评: 'com.dianping.v1',
  饿了么: 'me.ele',
  肯德基: 'com.yek.android.kfc.activitys',
  携程: 'ctrip.android.view',
  铁路12306: 'com.MobileTicket',
  '12306': 'com.MobileTicket',
  去哪儿旅行: 'com.Qunar',
  滴滴出行: 'com.sdu.didi.psnger',
  bilibili: 'tv.danmaku.bili',
  抖音: 'com.ss.android.ugc.aweme',
  懂车帝: 'com.ss.android.auto',
  快手: 'com.smile.gifmaker',
  腾讯视频: 'com.tencent.qqlive',
  爱奇艺: 'com.qiyi.video',
  优酷视频: 'com.youku.phone',
  芒果TV: 'com.hunantv.imgo.activity',
  红果短剧: 'com.phoenix.read',
  网易云音乐: 'com.netease.cloudmusic',
  QQ音乐: 'com.tencent.qqmusic',
  汽水音乐: 'com.luna.music',
  喜马拉雅: 'com.ximalaya.ting.android',
  番茄小说: 'com.dragon.read',
  七猫免费小说: 'com.kmxs.reader',
  飞书: 'com.ss.android.lark',
  QQ邮箱: 'com.tencent.androidqqmail',
  豆包: 'com.larus.nova',
  Keep: 'com.gotokeep.keep',
  美柚: 'com.lingan.seeyou',
  腾讯新闻: 'com.tencent.news',
  今日头条: 'com.ss.android.article.news',
  贝壳找房: 'com.lianjia.beike',
  安居客: 'com.anjuke.android.app',
  同花顺: 'com.hexin.plat.android',
  星穹铁道: 'com.miHoYo.hkrpg',
  '崩坏：星穹铁道': 'com.miHoYo.hkrpg',
  恋与深空: 'com.papegames.lysk.cn',

  // System apps
  'Android System Settings': 'com.android.settings',
  Settings: 'com.android.settings',
  'Audio Recorder': 'com.android.soundrecorder',
  Clock: 'com.android.deskclock',
  Contacts: 'com.android.contacts',
  Files: 'com.android.fileexplorer',

  // Google apps
  'Google Chrome': 'com.android.chrome',
  Gmail: 'com.google.android.gm',
  'Google Files': 'com.google.android.apps.nbu.files',
  'Google Calendar': 'com.google.android.calendar',
  'Google Chat': 'com.google.android.apps.dynamite',
  'Google Clock': 'com.google.android.deskclock',
  'Google Contacts': 'com.google.android.contacts',
  'Google Docs': 'com.google.android.apps.docs.editors.docs',
  'Google Drive': 'com.google.android.apps.docs',
  'Google Fit': 'com.google.android.apps.fitness',
  'Google Keep': 'com.google.android.keep',
  'Google Maps': 'com.google.android.apps.maps',
  'Google Play Books': 'com.google.android.apps.books',
  'Google Play Store': 'com.android.vending',
  'Google Slides': 'com.google.android.apps.docs.editors.slides',
  'Google Tasks': 'com.google.android.apps.tasks',

  // Third-party apps
  Bluecoins: 'com.rammigsoftware.bluecoins',
  Broccoli: 'com.flauschcode.broccoli',
  'Booking.com': 'com.booking',
  Duolingo: 'com.duolingo',
  Expedia: 'com.expedia.bookings',
  Joplin: 'net.cozic.joplin',
  McDonald: 'com.mcdonalds.app',
  Osmand: 'net.osmand',
  PiMusicPlayer: 'com.Project100Pi.themusicplayer',
  Quora: 'com.quora.android',
  Reddit: 'com.reddit.frontpage',
  RetroMusic: 'code.name.monkey.retromusic',
  SimpleCalendarPro:
    'com.scientificcalculatorplus.simplecalculator.basiccalculator.mathcalc',
  SimpleSMSMessenger: 'com.simplemobiletools.smsmessenger',
  Telegram: 'org.telegram.messenger',
  Temu: 'com.einnovation.temu',
  TikTok: 'com.zhiliaoapp.musically',
  Twitter: 'com.twitter.android',
  X: 'com.twitter.android',
  VLC: 'org.videolan.vlc',
  WeChat: 'com.tencent.mm',
  WhatsApp: 'com.whatsapp',
};
