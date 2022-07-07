import fetch from "node-fetch";
import { segment } from "oicq";
import { render } from "../render.js";
import lodash from "lodash";
import fs from "fs";
import { getUrl, getHeaders } from "./mysApi.js";
import format from "date-format";
import common from "../common.js";
import { MysUser, User } from "../components/Models.js";

const _path = process.cwd();

// let helpDoc = "https://docs.qq.com/doc/DUWNVQVFTU3liTVlO";

export const rule = {
  dailyNote: {
    hashMark: true,
    reg: "^#*(体力|树脂|查询体力)$",
    priority: 300,
    describe: "【体力，树脂】原神体力查询，需要私聊配置cookie",
  },
  bingCookie: {
    reg: "noCheck", //匹配的正则
    priority: 301, //优先级，越小优先度越高
    describe: "【cookie】私聊发送cookie绑定", //描述说明
  },
  noLogin: {
    reg: "(.*)_MHYUUID(.*)",
    priority: 302,
    describe: "请先登录米游社再获取",
  },
  delCookie: {
    reg: "^#*(删除(Cookie|cookie|ck)|开启(体力|树脂)*推送|关闭(体力|树脂)*推送)$",
    priority: 302,
    describe: "【删除cookie,开启推送,关闭推送】删除已添加cookie，体力推送开关",
  },
  resinhelp: {
    hashMark: true,
    reg: "^#*(体力|树脂|cookie|签到|原石)(帮助|说明|功能)$",
    priority: 303,
    describe: "【体力帮助】体力cookie获取帮助说明",
  },
  signAll: {
    hashMark: true,
    reg: "^(#签到|#*米游社(自动)*签到)$",
    priority: 304,
    describe: "【#签到】米游社签到，发送后自动开启签到",
  },
  signPush: {
    reg: "^#*(开启签到推送|关闭签到推送)$",
    priority: 305,
    describe: "【开启签到推送,关闭签到推送】开启或关闭原神米游社签到推送",
  },
  signClose: {
    reg: "^#*(开启|关闭)(米游社|自动)*签到$",
    priority: 305,
    describe: "【开启签到,关闭签到】开启或关闭原神米游社签到推送",
  },
  myCookie: {
    reg: "^#*我的(ck|cookie)$",
    priority: 305,
    describe: "【我的ck】获取自己已经绑定的ck",
  },
  ledger: {
    hashMark: true,
    reg: "^(#原石|#*札记)([0-9]|[一二两三四五六七八九十]+)*月*$",
    priority: 305,
    describe: "【#原石，#原石2月，#札记】查看最近三个月原石",
  },
  ledgerCount: {
    hashMark: true,
    reg: "^#*(原石|札记)统计$",
    priority: 306,
    describe: "",
  },
  signTaskAll: {
    reg: "^#(签到任务|全部签到)$",
    priority: 306,
    describe: "",
  },
  ledgerTask: {
    reg: "^#原石任务$",
    priority: 306,
    describe: "",
  },
};

if (!fs.existsSync(`./data/NoteCookie/`)) {
  fs.mkdirSync(`./data/NoteCookie/`);
}
if (!fs.existsSync(`./data/html/genshin/dailyNote/`)) {
  fs.mkdirSync(`./data/html/genshin/dailyNote/`);
}
if (!fs.existsSync(`./data/html/genshin/ledger/`)) {
  fs.mkdirSync(`./data/html/genshin/ledger/`);
}

let cookieContext = {}; //添加cookie上下文
let host = "https://api-takumi.mihoyo.com/";

//#体力
export async function dailyNote(e) {
  let cookie, uid;

  if (NoteCookie[e.user_id]) {
    cookie = NoteCookie[e.user_id].cookie;
    uid = NoteCookie[e.user_id].uid;
  } else if (BotConfig.dailyNote && BotConfig.dailyNote[e.user_id]) {
    cookie = BotConfig.dailyNote[e.user_id].cookie;
    uid = BotConfig.dailyNote[e.user_id].uid;
  } else {
    e.reply(`尚未配置，无法查询体力\n配置教程：${BotConfig.cookieDoc}`);
    return true;
  }

  const response = await getDailyNote(uid, cookie);
  if (!response.ok) {
    e.reply("米游社接口错误");
    return true;
  }
  const res = await response.json();

  if (res.retcode == 10102) {
    if (!e.openDailyNote) {
      e.openDailyNote = true;
      await openDailyNote(cookie); //自动开启
      dailyNote(e);
    } else {
      e.reply("请先开启实时便笺数据展示");
    }
    return true;
  }

  if (res.retcode != 0) {
    if (res.message == "Please login") {
      Bot.logger.mark(`体力cookie已失效`);
      e.reply(`体力cookie已失效，请重新配置\n注意：退出米游社登录cookie将会失效！`);

      if (NoteCookie[e.user_id]) {
        await MysUser.delNote(NoteCookie[e.user_id]);
        delete NoteCookie[e.user_id];
        saveJson();
      }
    } else {
      e.reply(`体力查询错误：${res.message}`);
      Bot.logger.mark(`体力查询错误:${JSON.stringify(res)}`);
    }

    return true;
  }

  //redis保存uid
  redis.set(`genshin:uid:${e.user_id}`, uid, { EX: 2592000 });

  //更新
  if (NoteCookie[e.user_id]) {
    NoteCookie[e.user_id].maxTime = new Date().getTime() + res.data.resin_recovery_time * 1000;
    saveJson();
  }

  let data = res.data;

  //推送任务
  if (e.isTask && data.current_resin < e.sendResin) {
    return;
  }

  if (e.isTask) {
    Bot.logger.mark(`体力推送:${e.user_id}`);
  }

  let nowDay = format("dd", new Date());
  let resinMaxTime;
  if (data.resin_recovery_time > 0) {
    resinMaxTime = new Date().getTime() + data.resin_recovery_time * 1000;
    let maxDate = new Date(resinMaxTime);
    resinMaxTime = format("hh:mm", maxDate);

    if (format("dd", maxDate) != nowDay) {
      resinMaxTime = `明天 ${resinMaxTime}`;
    } else {
      resinMaxTime = ` ${resinMaxTime}`;
    }
  }

  let remained_time = "";
  if (data.expeditions && data.expeditions.length >= 1) {
    remained_time = lodash.map(data.expeditions, "remained_time");
    remained_time = lodash.min(remained_time);

    if (remained_time > 0) {
      remained_time = new Date().getTime() + remained_time * 1000;
      let remainedDate = new Date(remained_time);
      remained_time = format("hh:mm", remainedDate);

      if (format("dd", remainedDate) != nowDay) {
        remained_time = `明天 ${remained_time}`;
      } else {
        remained_time = ` ${remained_time}`;
      }
    }
  }

  let coinTime = "";
  if (data.home_coin_recovery_time > 0) {
    let coinDay = Math.floor(data.home_coin_recovery_time / 3600 / 24);
    let coinHour = Math.floor((data.home_coin_recovery_time / 3600) % 24);
    let coinMin = Math.floor((data.home_coin_recovery_time / 60) % 60);
    if (coinDay > 0) {
      coinTime = `${coinDay}天${coinHour}小时${coinMin}分钟`;
    } else {
      let coinDate = new Date(new Date().getTime() + data.home_coin_recovery_time * 1000);
      if (format("dd", coinDate) != nowDay) {
        coinTime = `明天 ${format("hh:mm", coinDate)}`;
      } else {
        coinTime = format("hh:mm", coinDate);
      }
    }
  }

  let day = format("MM-dd hh:mm", new Date());
  let week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  day += " " + week[new Date().getDay()];

  //参量质变仪
  if (data?.transformer?.obtained) {
    data.transformer.reached = data.transformer.recovery_time.reached;
    let recovery_time = "";

    if (data.transformer.recovery_time.Day > 0) {
      recovery_time += `${data.transformer.recovery_time.Day}天`;
    }
    if (data.transformer.recovery_time.Hour > 0) {
      recovery_time += `${data.transformer.recovery_time.Hour}小时`;
    }
    if (data.transformer.recovery_time.Minute > 0) {
      recovery_time += `${data.transformer.recovery_time.Minute}分钟`;
    }
    data.transformer.recovery_time = recovery_time;
  }

  let base64 = await render("genshin", "dailyNote", {
    save_id: uid,
    uid: uid,
    resinMaxTime,
    remained_time,
    coinTime,
    day,
    ...data,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }
  return true;
}

//请先登录米游社
export async function noLogin(e) {
  if (!e.isPrivate) {
    return false;
  }
  e.reply("请先【登录米游社】再获取cookie");
  return true;
}

//绑定cookie
export async function bingCookie(e) {
  if (!e.isPrivate || e.img || !e.msg) {
    return false;
  }

  let uid,
    qq = e.user_id;
  let reg = /[1|2|5][0-9]{8}/g;

  if (reg.test(e.msg) && cookieContext[qq] && !e.msg.includes("ltoken")) {
    uid = e.msg.match(reg)[0];
    e.msg = cookieContext[qq];
  }

  if (!e.msg.includes("ltoken")) {
    return false;
  }

  let cookie = e.msg.replace(/#|\'|\"/g, "") + ";";
  let param = cookie.match(/ltoken=([^;]+;)|ltuid=(\w{0,9})|cookie_token=([^;]+;)/g);

  if (!param) {
    e.reply("复制体力cookie错误\n正确例子：ltoken=***;ltuid=***;");
    return;
  }

  let token = {};
  for (let val of param) {
    let tmp = val.split("=");
    token[tmp[0]] = tmp[1];
  }

  let ltoken = `ltoken=${token["ltoken"]}ltuid=${token["ltuid"]};`;

  //cookie_token转换uid
  if (e.msg.includes("cookie_token=") && !uid) {
    let cookie_token = `cookie_token=${token["cookie_token"]} account_id=${token["ltuid"]};`;
    ltoken += cookie_token;

    let headers = {
      Cookie: ltoken,
    };

    let url = host + "binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn";

    const response = await fetch(url, { method: "get", headers });
    if (!response.ok) {
      e.reply("米游社接口错误");
      return true;
    }
    const res = await response.json();

    if (res.retcode != 0) {
      e.reply(`体力cookie错误：${res.message}`);
      return true;
    }
    for (let val of res.data.list) {
      //米游社默认展示的角色
      if (val.is_chosen) {
        uid = val.game_uid;
        break;
      }
    }
    if (!uid) {
      if (!res.data.list || res.data.list.length <= 0) {
        e.reply("米游社账号未绑定原神角色！");
        return true;
      }
      uid = res.data.list[0].game_uid;
    }
  } else {
    if (!uid) {
      e.reply("cookie发送成功\n请再发送你游戏的uid完成绑定");
      cookieContext[qq] = e.msg;
      return true;
    } else {
      delete cookieContext[qq];
    }
  }

  //调用一次判断cookie是否正确
  const response = await getDailyNote(uid, ltoken);
  if (!response.ok) {
    e.reply("米游社接口错误");
    return true;
  }
  const res = await response.json();

  if (res.retcode == 10104) {
    e.reply(`uid错误，请重新输入`);
    cookieContext[qq] = e.msg;
    return true;
  }

  if (res.retcode != 0 && res.retcode != 10102) {
    e.reply(`体力cookie错误：${res.message}`);
    Bot.logger.mark(`添加体力cookie失败:${res.message}`);
    return true;
  }

  let mysUser = await MysUser.get(uid, ltoken);
  if (!mysUser.cookie) {
    await mysUser.setCookie(ltoken);
  }
  let selfUser = await User.get(qq);

  let bindRet = await selfUser.bindMysUser(mysUser);
  if (!bindRet) {
    e.reply("Cookie绑定失败，请退出米游社重新登录后获取Cookie，私聊Bot重新绑定");
    return true;
  }

  // Bot.logger.mark(`添加体力cookie成功:${qq}`);

  e.reply(`体力cookie配置成功，可私聊Bot绑定更多Cookie以快速切换uid\n通过命令【#uid】查看已绑定的uid列表`);
  let msg = `【#体力】查询当前树脂`;
  msg += `\n【#开启推送】开启体力大于120时推送`;
  msg += `\n【#关闭推送】关闭体力推送`;
  if (cookie.includes("cookie_token")) {
    msg += `\n【#签到】原神米游社签到`;
    msg += `\n【#关闭签到】关闭自动签到`;
    msg += `\n【#原石】查看原石札记`;
    msg += `\n【#原石统计】统计原石数据`;
    msg += `\n【#练度统计】可以查看更多数据`;
    msg += `\n注意：退出米游社登录cookie将会失效！`;
  } else {
    msg += `\n【cookie不完整】仅支持查询【体力】\n退出米游社重登，刷新获取完整cookie再发送`;
  }
  e.reply(msg);

  return true;
}

//删除cookie
export async function delCookie(e) {
  let selfUser = await User.get(e.user_id);
  if (e.msg.includes("删除")) {
    if (!NoteCookie[e.user_id]) {
      return true;
    }

    if (cookieContext[e.user_id]) {
      delete cookieContext[e.user_id];
    }
    // 将用户从MysUser缓存中删除
    await MysUser.delNote(NoteCookie[e.user_id]);
    delete NoteCookie[e.user_id];
    saveJson();
    Bot.logger.mark(`删除cookie:${e.user_id}`);

    let mUsers = await selfUser.getAllMysUser();
    if (mUsers.length > 0) {
      await selfUser.bindMysUser(mUsers[0]);
      e.reply(`体力配置cookie已删除。已切换至uid: ${selfUser.uid}`);
    } else {
      e.reply("体力配置cookie已删除");
    }
  }

  if (e.msg.includes("开启")) {
    if (NoteCookie[e.user_id]) {
      NoteCookie[e.user_id].isPush = true;
      saveJson();
      Bot.logger.mark(`开启体力推送:${e.user_id}`);

      e.reply("体力推送已开启");
    } else {
      // e.reply("请先添加cookie");
    }
  }

  if (e.msg.includes("关闭")) {
    if (NoteCookie[e.user_id]) {
      NoteCookie[e.user_id].isPush = false;
      saveJson();
      Bot.logger.mark(`关闭体力推送:${e.user_id}`);
      e.reply("体力推送已关闭");
    } else {
      // e.reply("请先添加cookie");
    }
  }
  return true;
}

export async function saveJson() {
  let path = "data/NoteCookie/NoteCookie.json";
  fs.writeFileSync(path, JSON.stringify(NoteCookie, "", "\t"));
}

//体力定时推送
export async function DailyNoteTask() {
  //体力大于多少时推送
  let sendResin = 120;
  //推送cd，12小时一次
  let sendCD = 12 * 3600;

  let isPush = BotConfig?.pushTask?.isPushNote;
  if (isPush === false || isPush === 0) {
    return;
  }

  //获取需要推送的用户
  for (let [user_id, cookie] of Object.entries(NoteCookie)) {
    user_id = cookie.qq || user_id;
    //没有开启推送
    if (!cookie.isPush) {
      continue;
    }

    //今天已经提醒
    let sendkey = `genshin:dailyNote:send:${user_id}`;
    let send = await redis.get(sendkey);
    if (send) {
      continue;
    }

    let e = { sendResin, user_id, isTask: true };

    e.reply = (msg) => {
      common.relpyPrivate(user_id, msg);
    };

    //判断今天是否推送
    if (cookie.maxTime && cookie.maxTime > 0 && new Date().getTime() > cookie.maxTime - (160 - sendResin) * 8 * 60 * 1000) {
      //Bot.logger.mark(`体力推送:${user_id}`);

      redis.set(sendkey, "1", { EX: sendCD });

      await dailyNote(e);
    }
  }
}

//便签
async function getDailyNote(uid, cookie) {
  let { url, headers, query, body } = getUrl("dailyNote", uid);

  headers.Cookie = cookie;

  const response = await fetch(url, { method: "get", headers });
  return response;
}

//便签开关
async function openDailyNote(cookie) {
  let url = host + "game_record/card/wapi/getGameRecordCard?uid=";
  let change_url = host + "game_record/card/wapi/changeDataSwitch";
  let query = "";
  let body = `{"is_public":true,"switch_id":3,"game_id":"2"}`;

  let headers = getHeaders(query, body);
  headers.Cookie = cookie;

  let account_id = cookie.match(/ltuid=(\w{0,9})/g)[0].replace(/ltuid=|;/g, "");

  const res = await fetch(url + account_id, { method: "GET", headers });
  const response = await fetch(change_url, { method: "POST", body, headers });

  return response;
}

//体力帮助
export function resinhelp(e) {
  e.reply(`体力Cookie查询配置教程：${BotConfig.cookieDoc}\n获取Cookie后请私聊发送给Bot进行绑定`);
  return true;
}

//#签到
export async function sign(e) {
  //获取cookie
  let cookie, uid;
  let user_id = e._user_id || e.user_id;

  if (NoteCookie[user_id]) {
    cookie = NoteCookie[user_id].cookie;
    uid = NoteCookie[user_id].uid;
  } else if (BotConfig.dailyNote && BotConfig.dailyNote[user_id]) {
    cookie = BotConfig.dailyNote[user_id].cookie;
    uid = BotConfig.dailyNote[user_id].uid;
  } else {
    e.reply(`尚未配置，无法自动签到\n配置教程：${BotConfig.cookieDoc}`);
    return true;
  }

  if (!cookie.includes("cookie_token")) {
    e.reply("配置cookie不完整，不支持米游社签到\n请退出米游社重新登录获取完整cookie");
    return true;
  }

  //判断是否已经签到
  let response = await bbs_sign_info(uid, cookie);
  if (!response.ok) {
    e.reply("米游社接口错误");
    return true;
  }
  let signInfo = await response.json();

  if (signInfo.retcode != 0) {
    e.reply(`体力cookie错误：${signInfo.message}`);
    //cookie已失效
    if (signInfo.message == "尚未登录" && cookie.includes("cookie_token")) {
      Bot.logger.mark(`体力cookie已失效:${user_id}`);
      if (NoteCookie[user_id]) {
        // delete NoteCookie[user_id];
        // saveJson();
        await MysUser.delNote(NoteCookie[user_id]);
      }
    } else {
      Bot.logger.mark(`米游社info接口错误[${user_id}]:${JSON.stringify(signInfo)}`);
    }
    return true;
  }

  let reward = await getReward(uid, cookie);
  if (reward && reward.length > 0) {
    if (signInfo.data.is_sign) {
      reward = reward[signInfo.data.total_sign_day - 1] || "";
    } else {
      reward = reward[signInfo.data.total_sign_day] || "";
    }
    if (reward.name && reward.cnt) {
      reward = `${reward.name}*${reward.cnt}`;
    }
  } else {
    reward = "";
  }

  //保存已签到
  if (signInfo.data && signInfo.data.is_sign) {
    if (e.isTask) {
      redis.set(`genshin:dailyNote:signed:${user_id}`, JSON.stringify({
        day: signInfo.data.total_sign_day,
        reward
      }), { EX: common.getDayEnd() });
    }
    e.reply(`已签到，第${signInfo.data.total_sign_day}天奖励：${reward}`);
    return true;
  }

  let total_sign_day = signInfo.data.total_sign_day;
  if (!signInfo.data.is_sign) {
    total_sign_day++;
  }

  //签到
  response = await bbs_sign(uid, cookie);
  if (!response.ok) {
    e.reply("米游社接口错误");
    return true;
  }
  let res = await response.json();

  if (res.retcode == 0 || res.retcode == -5003) {
    if (e.isTask) {
      redis.set(`genshin:dailyNote:signed:${user_id}`, JSON.stringify({
        day: total_sign_day,
        reward
      }), { EX: common.getDayEnd() });
    }
    e.reply(`签到成功，第${total_sign_day}天奖励：${reward}`);
    Bot.logger.mark(`米游社签到成功:${user_id}`);
  } else {
    e.reply(`米游社签到：${res.message}`);
    Bot.logger.mark(`米游社签到接口错误[${user_id}]：${res.message}`);
  }

  return true;
}

export async function signAll(e) {
  //定时米游社签到
  e._reply = e.reply;
  let msgs = [];
  for (let [user_id, cookie] of Object.entries(NoteCookie)) {
    let qq = cookie.qq || user_id,
      uid = cookie.uid;
    if (!cookie.cookie.includes("cookie_token")) {
      continue;
    }
    if (qq * 1 !== e.user_id * 1) {
      continue;
    }

    e._user_id = user_id;
    e.isTask = true;

    e.reply = (msg) => {
      msgs.push(`【${uid}】：${msg}`);
    };

    //已签到不重复执行
    let key = `genshin:dailyNote:signed:${user_id}`;
    let signRet = await redis.get(key);
    if (signRet) {
      if (signRet !== "1") {
        try {
          signRet = JSON.parse(signRet)
        } catch {
        }
      }
      if (signRet.day && signRet.reward) {
        e.reply(`已签到，第${signRet.day}奖励：${signRet.reward}`);
      } else {
        e.reply("已签到");
      }
      continue;
    }
    await sign(e);
  }
  if (msgs.length > 0) {
    e._reply(msgs.join("\n"));
  }
  return true;
}

//签到信息
async function bbs_sign_info(uid, cookie) {
  let { url, headers, query, body } = getUrl("bbs_sign_info", uid);

  headers.Cookie = cookie;

  const response = await fetch(url, { method: "get", headers });
  return response;
}

//签到奖励
async function bbs_sign_home(uid, cookie) {
  let { url, headers, query, body } = getUrl("bbs_sign_home", uid);

  headers.Cookie = cookie;

  const response = await fetch(url, { method: "get", headers });
  return response;
}

//签到
async function bbs_sign(uid, cookie) {
  let { url, headers, body } = getUrl("bbs_sign", uid);
  headers.Cookie = cookie;

  const response = await fetch(url, { method: "post", body, headers });
  return response;
}

//缓存签到奖励
async function getReward(uid, cookie) {
  let key = `genshin:dailyNote:signReward`;
  let reward = await redis.get(key);
  if (reward) {
    return JSON.parse(reward);
  }

  let response = await bbs_sign_home(uid, cookie);
  if (!response.ok) {
    return "";
  }

  let home = await response.json();
  if (home.data && home.data.awards && home.data.awards.length > 0) {
    reward = home.data.awards;
    redis.set(key, JSON.stringify(reward), { EX: 86400 * 31 });
    return reward;
  }

  return "";
}

//定时米游社签到
export async function signTask() {
  Bot.logger.mark(`开始签到任务`);
  //获取需要签到的用户
  for (let [user_id, cookie] of Object.entries(NoteCookie)) {
    let qq = cookie.qq || user_id;
    if (!cookie.cookie.includes("cookie_token")) {
      continue;
    }

    if (cookie.isSignAuto === false) {
      continue;
    }

    let e = { user_id, qq, isTask: true };

    //已签到不重复执行
    let key = `genshin:dailyNote:signed:${user_id}`;
    if (await redis.get(key)) {
      continue;
    }

    e.reply = (msg) => {
      //关闭签到消息推送
      if (BotConfig?.pushTask?.isPushSign != 1) {
        return;
      }
      if (msg.includes("签到成功") && (cookie.isSignPush === true || cookie.isSignPush === undefined)) {
        msg = msg.replace("签到成功", "自动签到成功");
        common.relpyPrivate(qq, msg);
      }
    };

    await sign(e);
    await common.sleep(10000);
  }
  Bot.logger.mark(`签到任务完成`);
}

/** 手动全部签到 */
export async function signTaskAll(e) {
  if (e.msg && !e.isMaster) return true;

  e.reply(`开始签到任务，完成前请勿重复执行`);

  await signTask();

  e.reply(`签到任务已完成`);
}

//#开启签到推送
export async function signPush(e) {
  if (e.msg.includes("开启")) {
    if (NoteCookie[e.user_id]) {
      NoteCookie[e.user_id].isSignPush = true;
      saveJson();
      Bot.logger.mark(`开启原神米游社签到推送:${e.user_id}`);

      e.reply("原神米游社签到推送已开启");
    } else {
      // e.reply("请先添加cookie");
    }
  }

  if (e.msg.includes("关闭")) {
    if (NoteCookie[e.user_id]) {
      NoteCookie[e.user_id].isSignPush = false;
      saveJson();
      Bot.logger.mark(`关闭原神米游社签到推送:${e.user_id}`);
      e.reply("原神米游社签到推送已关闭");
    } else {
      // e.reply("请先添加cookie");
    }
  }
  return true;
}

//#开启签到，关闭签到
export async function signClose(e) {
  if (e.msg.includes("开启")) {
    if (NoteCookie[e.user_id]) {
      NoteCookie[e.user_id].isSignAuto = true;
      saveJson();
      Bot.logger.mark(`原神米游社自动签到已开启:${e.user_id}`);

      e.reply("原神米游社自动签到已开启");
    } else {
      // e.reply("请先添加cookie");
    }
  }

  if (e.msg.includes("关闭")) {
    if (NoteCookie[e.user_id]) {
      NoteCookie[e.user_id].isSignAuto = false;
      saveJson();
      Bot.logger.mark(`原神米游社自动签到已关闭:${e.user_id}`);
      e.reply("原神米游社签到自动已关闭");
    } else {
      // e.reply("请先添加cookie");
    }
  }
  return true;
}

//我的ck
export async function myCookie(e) {
  if (e.isGroup) return;
  if (NoteCookie[e.user_id]) {
    e.reply(NoteCookie[e.user_id].cookie);
  }
  return true;
}

//#原石
export async function ledger(e) {
  let month = e.msg.replace(/#|原石|月|札记/g, "");
  let NowMonth = Number(format("MM", new Date()));
  let monthData = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  if (month) {
    if (isNaN(month)) {
      for (let i in monthData) {
        if (month == monthData[i]) {
          month = Number(i) + 1;
          break;
        }
      }
      if (isNaN(month)) {
        month = NowMonth;
      }
    }
  } else {
    month = NowMonth;
  }
  if (month < 1 || month > 12) {
    month = NowMonth;
  }

  //获取前三个月
  let monthArr = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].splice(NowMonth - 1, 3);
  if (!monthArr.includes(Number(month))) {
    e.reply("札记仅支持查询最近三个月的数据");
    return true;
  }
  if ((NowMonth >= 3 && month > NowMonth) || (NowMonth < 3 && month > NowMonth && month <= 9 + month)) {
    month = NowMonth;
  }

  //获取cookie
  let cookie, uid;

  if (NoteCookie[e.user_id]) {
    cookie = NoteCookie[e.user_id].cookie;
    uid = NoteCookie[e.user_id].uid;
  } else if (BotConfig.dailyNote && BotConfig.dailyNote[e.user_id]) {
    cookie = BotConfig.dailyNote[e.user_id].cookie;
    uid = BotConfig.dailyNote[e.user_id].uid;
  } else {
    e.reply(`尚未配置，无法查询\n配置教程：${BotConfig.cookieDoc}`);
    return true;
  }

  if (!cookie.includes("cookie_token")) {
    e.reply("配置cookie不完整，不支持札记查询\n请退出米游社重新登录获取完整cookie");
    return true;
  }

  if (checkFirstDay(e)) return true;

  let response = await ys_ledger(uid, cookie, month);
  if (!response.ok) {
    e.reply("米游社接口错误");
    return true;
  }
  let ledgerInfo = await response.json();
  if (ledgerInfo.retcode != 0) {
    e.reply(`接口错误：${ledgerInfo.message}`);
    Bot.logger.mark(`米游社ledgerInfo接口错误[${e.user_id}]:${JSON.stringify(ledgerInfo)}`);
    return true;
  }
  e.nowData = ledgerInfo;
  ledgerInfo = ledgerInfo.data;

  //保存原石数据
  save_ledger(e, uid, cookie);

  let day;
  if (month == NowMonth) {
    day = `${month}月${Number(format("dd", new Date()))}号`;
  } else {
    day = `${month}月`;
  }

  ledgerInfo.month_data.gacha = (ledgerInfo.month_data.current_primogems / 160).toFixed(0);
  ledgerInfo.month_data.last_gacha = (ledgerInfo.month_data.last_primogems / 160).toFixed(0);
  if (ledgerInfo.month_data.current_primogems > 10000) {
    ledgerInfo.month_data.current_primogems = (ledgerInfo.month_data.current_primogems / 10000).toFixed(2) + " w";
  }
  if (ledgerInfo.month_data.last_primogems > 10000) {
    ledgerInfo.month_data.last_primogems = (ledgerInfo.month_data.last_primogems / 10000).toFixed(2) + " w";
  }
  if (ledgerInfo.month_data.current_mora > 10000) {
    ledgerInfo.month_data.current_mora = (ledgerInfo.month_data.current_mora / 10000).toFixed(1) + " w";
  }
  if (ledgerInfo.month_data.last_mora > 10000) {
    ledgerInfo.month_data.last_mora = (ledgerInfo.month_data.last_mora / 10000).toFixed(1) + " w";
  }
  if (ledgerInfo.day_data.current_primogems > 10000) {
    ledgerInfo.day_data.current_primogems = (ledgerInfo.day_data.current_primogems / 10000).toFixed(1) + " w";
  }
  if (ledgerInfo.day_data.current_mora > 10000) {
    ledgerInfo.day_data.current_mora = (ledgerInfo.day_data.current_mora / 10000).toFixed(1) + " w";
  }

  let color = ["#73a9c6", "#d56565", "#70b2b4", "#bd9a5a", "#739970", "#7a6da7", "#597ea0"];
  for (let i in ledgerInfo.month_data.group_by) {
    ledgerInfo.month_data.group_by[i].color = color[ledgerInfo.month_data.group_by[i].action_id];
  }
  ledgerInfo.color = [];
  ledgerInfo.month_data.group_by.forEach((item) => {
    ledgerInfo.color.push(["#73a9c6", "#d56565", "#70b2b4", "#bd9a5a", "#739970", "#7a6da7", "#597ea0"][item.action_id]);
  });
  ledgerInfo.group_by = JSON.stringify(ledgerInfo.month_data.group_by);
  ledgerInfo.color = JSON.stringify(ledgerInfo.color);

  let base64 = await render("genshin", "ledger", {
    save_id: uid,
    uid: uid,
    day: day,
    ...ledgerInfo,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }
  return true;
}

//札记信息
async function ys_ledger(uid, cookie, month) {
  let { url, headers, query, body } = getUrl("ys_ledger", uid, { month: month });

  headers.Cookie = cookie;

  const response = await fetch(url, { method: "get", headers });
  return response;
}

//保存上两个原石数据
async function save_ledger(e, uid, cookie) {
  if (!fs.existsSync(`./data/NoteData`)) {
    fs.mkdirSync(`./data/NoteData`);
  }

  let dataPath = `./data/NoteData/${uid}.json`;
  let NoteData = {};
  if (fs.existsSync(dataPath)) {
    NoteData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  }

  let date = new Date();
  let year = Number(format("yyyy", date));
  let NowMonth = Number(format("MM", date));

  //获取前三个月
  let monthArr = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].splice(NowMonth - 1, 3);

  for (let month of monthArr) {
    //上一年
    if (NowMonth <= 2 && month >= 11) {
      year--;
    }

    if (!NoteData[year]) NoteData[year] = {};

    if (NoteData[year][month] && NowMonth != month && NoteData[year][month].isUpdate) continue;

    let ledgerInfo;
    if (NowMonth == month && e.nowData && e.nowData?.data?.data_month == NowMonth) {
      ledgerInfo = e.nowData;
    } else {
      let response = await ys_ledger(uid, cookie, month);
      if (!response.ok) {
        continue;
      }
      ledgerInfo = await response.json();
    }

    if (ledgerInfo.retcode != 0) {
      Bot.logger.mark(`米游社ledgerInfo接口错误[${uid}]:${JSON.stringify(ledgerInfo)}`);
      continue;
    }

    if (NowMonth != month) {
      ledgerInfo.data.isUpdate = true;
    }

    NoteData[year][month] = ledgerInfo.data;

    common.sleep(100);
  }

  fs.writeFileSync(dataPath, JSON.stringify(NoteData, "", "\t"));
  return NoteData;
}

//#原石统计
export async function ledgerCount(e) {
  //获取cookie
  let cookie, uid;

  if (NoteCookie[e.user_id]) {
    cookie = NoteCookie[e.user_id].cookie;
    uid = NoteCookie[e.user_id].uid;
  } else if (BotConfig.dailyNote && BotConfig.dailyNote[e.user_id]) {
    cookie = BotConfig.dailyNote[e.user_id].cookie;
    uid = BotConfig.dailyNote[e.user_id].uid;
  } else {
    e.reply(`尚未配置，无法查询\n配置教程：${BotConfig.cookieDoc}`);
    return true;
  }

  if (!cookie.includes("cookie_token")) {
    e.reply("配置cookie不完整，不支持札记查询\n请退出米游社重新登录获取完整cookie");
    return true;
  }

  if (checkFirstDay(e)) return true;

  //保存原石数据
  let NoteData = await save_ledger(e, uid, cookie);

  let year = format("yyyy", new Date());
  NoteData = NoteData[year];

  if (!NoteData || lodash.isEmpty(NoteData)) return;

  if (e.isTask) {
    Bot.logger.mark(`原石统计推送:${uid}`);
  }

  let data = {
    allPrimogems: 0,
    allMora: 0,
    primogemsMonth: [],
    moraMonth: [],
  };

  lodash.forEach(NoteData, (val) => {
    data.allPrimogems += val.month_data.current_primogems;
    data.allMora += val.month_data.current_mora;
    //柱状图数据
    data.primogemsMonth.push({
      value: val.month_data.current_primogems,
      month: val.data_month.toString(),
      name: "原石",
    });
    data.moraMonth.push({
      value: (val.month_data.current_mora / 1000).toFixed(0),
      month: val.data_month.toString(),
      name: "摩拉",
    });
  });

  //单位处理
  data.allMora = (data.allMora / 10000).toFixed(0) + "w";
  data.allPrimogemsShow = (data.allPrimogems / 10000).toFixed(2) + "w";
  data.allGacha = (data.allPrimogems / 160).toFixed(0);

  //原石最多
  data.maxPrimogems = lodash.maxBy(data.primogemsMonth, "value");
  data.maxMora = lodash.maxBy(data.moraMonth, "value");

  //按月份重新排序
  data.primogemsMonth = lodash.sortBy(data.primogemsMonth, ["month"]);

  let group_by = lodash(NoteData).map("month_data").map("group_by").flatMap().value();

  let pieData = {};
  for (let val of group_by) {
    if (!pieData[val.action]) {
      pieData[val.action] = {
        num: val.num,
        action: val.action,
        action_id: val.action_id,
      };
    } else {
      pieData[val.action].num += val.num;
    }
  }

  pieData = lodash.flatMap(pieData, (item) => {
    return item;
  });
  pieData = lodash.orderBy(pieData, ["num"], ["desc"]);

  data.color = [];
  pieData.forEach((item) => {
    data.color.push(["#73a9c6", "#d56565", "#70b2b4", "#bd9a5a", "#739970", "#7a6da7", "#597ea0"][item.action_id]);
  });

  data.group_by = pieData;

  data.color = JSON.stringify(data.color);
  data.pieData = JSON.stringify(pieData);
  data.primogemsMonth = JSON.stringify(data.primogemsMonth);

  let base64 = await render("genshin", "ledgerCount", {
    save_id: uid,
    uid: uid,
    ...data,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }
  return true;
}

//判断是不是每月第一天
function checkFirstDay(e) {
  let date = new Date();
  let NowDay = date.getDate();
  let NowHour = date.getHours();

  if (NowDay <= 1 && NowHour <= 3) {
    e.reply("每月一号数据更新中，请稍后再试");
    return true;
  }

  return false;
}

/** 原石统计任务 */
export async function ledgerTask(e = {}) {
  if (e.msg && !e.isMaster) return true;

  let isPush = BotConfig?.pushTask?.isPushLedger;
  if (isPush === false || isPush === 0) {
    return;
  }

  Bot.logger.mark(`开始原石统计任务`);

  for (let [user_id, cookie] of Object.entries(NoteCookie)) {
    user_id = cookie.qq || user_id;

    /** ck不完整 */
    if (!cookie.cookie.includes("cookie_token")) continue;

    let e = { user_id, isTask: true };

    // 已执行的不重复执行
    let key = `genshin:ledgerCount:pushed:${user_id}`;
    if (await redis.get(key)) continue;

    Bot.logger.debug(`原石统计:${user_id}`);

    e.reply = (msg) => {
      if (msg.type && msg.type == "image") {
        redis.set(key, "1", { EX: common.getDayEnd() });
        msg = ["原石统计推送：\n", msg];
      }
      common.relpyPrivate(user_id, msg);
    };

    await ledgerCount(e).catch((err) => {
      Bot.logger.error(`原石统计失败[${user_id}]:${err}`);
    });

    await common.sleep(30000);
  }

  Bot.logger.mark(`原石统计任务完成`);
}
