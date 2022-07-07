import { segment } from "oicq";
import lodash from "lodash";
import { render, getPluginRender } from "./render.js"
import * as Components from "./components/index.js"

let { Msg } = Components;
let groupCD = {};
let singleCD = {};
let PokeCD = {};

/**
 * 处理群聊私聊消息
 */
async function dealMsg(e) {
  if (!isInit) return;

  let tmpCommand = {}
  //黑名单
  if (BotConfig.balckQQ && BotConfig.balckQQ.includes(Number(e.user_id))) {
    return;
  }

  //没有群昵称的用qq昵称代替
  if (!e.sender.card) {
    e.sender.card = e.sender.nickname;
  }

  //主人qq
  if (BotConfig.masterQQ && BotConfig.masterQQ.includes(Number(e.user_id))) {
    e.isMaster = true;
  }

  if (e.user_id == BotConfig.account.qq) {
    return;
  }
  if (typeof groupConfig == undefined || typeof command == undefined) {
    return;
  }
  if (e.isGroup) {
    if (typeof GroupCommand == undefined) {
      return;
    }
    //黑名单群
    if (BotConfig.balckGroup && BotConfig.balckGroup.includes(Number(e.group_id))) {
      return;
    }
    //禁言中
    if (e.group.mute_left > 0) {
      return;
    }
    if (groupConfig && groupConfig[e.group_id]) {
      e.groupConfig = groupConfig[e.group_id];
    }

    if (!GroupCommand[e.group_id]) {
      YunzaiApps.admin.initGroupCommand(e.group_id);
    }

    tmpCommand = GroupCommand[e.group_id];
    e.logText = `[${e.group_name}(${e.sender.card})]`;
  } else {
    e.group_name = "私聊";
    e.logText = `[私聊][${e.sender.nickname}(${e.user_id})]`;
    tmpCommand = command;
  }

  if (!e.groupConfig) {
    e.groupConfig = groupConfig.default;
  }

  //判断冷却cd
  if (!e.isPoke && !checkLimit(e)) {
    return;
  }

  //重写reply方法，捕获发送消息失败异常
  e.replyNew = e.reply;
  e.reply = (msg, quote = false) => {
    redis.incr(`Yunzai:sendMsgNum:${BotConfig.account.qq}`);
    msg = YunzaiApps.other.checkMsg(msg);
    if (e.isPoke) {
      return e.replyNew(msg, quote);
    } else {
      return e.replyNew(msg, quote).catch((err) => {
        Bot.logger.mark(err);
      });
    }
  };

  let privateBool = false;
  //处理消息
  for (let val of e.message || []) {
    switch (val.type) {
      case "text":
        val.text = val.text.replace(/＃|井/g, "#").trim();
        if (e.msg) {
          e.msg += val.text;
        } else {
          e.msg = val.text;
        }
        if (e.isPrivate && e.msg.indexOf("ltoken") == -1 && !e.isMaster && e.msg.indexOf("authkey_ver") == -
          1 && !/^[0-9]{9}$/.test(e.msg) && BotConfig.DisablePrivate) {
          privateBool = true;
        }
        break;
      case "image":
        if (!e.img) {
          e.img = [];
        }
        e.img.push(val.url);
        if (e.isPrivate && !e.isMaster && BotConfig.DisablePrivate) {
          privateBool = true;
        }
        break;
      case "at":
        if (val.qq == BotConfig.account.qq) {
          // 可能不止一个at，只要匹配到就算atBot
          e.atBot = true;
          e.at = e.at || val.qq;
        } else {
          // atBot的优先级比其他的优先级低，尽量保留对其他人的at
          e.at = val.qq;
        }
        if (e.isPrivate && !e.isMaster && BotConfig.DisablePrivate) {
          privateBool = true;
        }
        break;
      case "file":
        e.file = {
          name: val.name,
          fid: val.fid
        };
        if (e.isPrivate && !e.isMaster && val.name.indexOf("txt") == -1 && BotConfig.DisablePrivate) {
          privateBool = true;
        }
        break;
    }
  }
  if (privateBool && BotConfig.DisablePrivate) {
    if (!BotConfig.DisableMsg) return true
    e.reply(BotConfig.DisableMsg)
    return true;
  }
  //回复消息
  if (e.source) {
    e.hasReply = true;
  }

  if (typeof YunzaiApps == "undefined") {
    return;
  }

  if (e.groupConfig.onlyReplyAt && e.isGroup && !e.isPoke) {
    // 如果在当前群开启了onlyReplyAt，则只回复atBot的消息及特定前缀的消息
    let alias = lodash.trim(e.groupConfig.botAlias);
    if (alias && e.msg) {
      if (lodash.startsWith(e.msg.trim(), alias)) {
        e.at = e.at || BotConfig.account.qq;
        e.atBot = true;
        e.msg = e.msg.replace(new RegExp("^\\s*" + alias + "\\s*"), "");
      }
    }
    if (!e.atBot) {
      return;
    }
  }

  // 为e绑定checkMsg
  e.getMysApi = async function (cfg) {
    return await Msg.getMysApi(e, cfg);
  }
  e.checkAuth = async function (cfg) {
    return await Msg.checkAuth(e, cfg);
  }


  for (let val of tmpCommand) {
    let msg = e.msg;

    //禁用功能
    if (e.groupConfig.disable && e.groupConfig.disable.length > 0) {
      if (lodash.intersection(e.groupConfig.disable, [val.type, `${val.type}.${val.name}`, "all"]).length > 0) {
        continue;
      }
    }

    //原神查询功能时，@机器人代替#号
    if ((val.type == "mysInfo" || val.hashMark) && e.atBot && msg) {
      msg = "#" + msg.replace("#", "");
    }

    if (!val.reg) {
      val.reg = "noCheck";
    }

    if (new RegExp(val.reg).test(msg) || val.reg == "noCheck" || (e.isPoke && val.reg === "#poke#")) {
      let log = `${e.logText} ${msg}:${val.name}`;

      if (val.reg == "noCheck") {
        // Bot.logger.debug(log);
      } else {
        Bot.logger.mark(log);
      }

      let { type, name, _plugin } = val;

      if (_plugin) {
        type = "plugin_" + type;
      }

      if (!YunzaiApps[type] || !YunzaiApps[type][name]) {
        Bot.logger.error(`请先export该方法：${type}.${name}`);
        return;
      }

      try {
        let res = await YunzaiApps[type][name](e, {
          render: _plugin ? getPluginRender(_plugin) : render,
          ...Components
        });
        if (res) {
          //设置cd
          setLimit(e);
          break;
        }
      } catch (error) {
        Bot.logger.error(`${type}.${name}`);
        Bot.logger.error(decodeURI(error.stack));
        break;
      }
    }
  }
}

/**
 * 设置命令冷却时间
 */
function setLimit(e) {
  if (e.isPrivate) {
    return true;
  }
  if (e.isPoke) {
    let cd = e.groupConfig.PokeCD ? e.groupConfig.PokeCD : 5000;
    PokeCD[e.group_id] = 1;
    setTimeout(() => {
      delete PokeCD[e.group_id];
    }, cd);
    return;
  }
  if (e.groupConfig.groupCD) {
    groupCD[e.group_id] = true;
    setTimeout(() => {
      delete groupCD[e.group_id];
    }, e.groupConfig.groupCD);
  }
  if (e.groupConfig.singleCD) {
    if (!singleCD[e.group_id]) {
      singleCD[e.group_id] = {};
    }
    singleCD[e.group_id][e.user_id] = true;
    setTimeout(() => {
      delete singleCD[e.group_id][e.user_id];
    }, e.groupConfig.singleCD);
  }
}

/**
 * 检查命令冷却cd，防止刷屏
 */
function checkLimit(e) {
  if (e.isPrivate) {
    return true;
  }
  if (e.isPoke) {
    if (PokeCD[e.group_id]) {
      return false;
    }
    return true;
  }
  if (e.groupConfig.groupCD && groupCD[e.group_id]) {
    return false;
  }
  if (e.groupConfig.singleCD && singleCD[e.group_id] && singleCD[e.group_id][e.user_id]) {
    return false;
  }
  return true;
}

/**
 * 群消息通知，戳一戳，新人加入，禁言
 */
async function dealGroupNotice(e) {
  //黑名单群
  if (BotConfig.balckGroup && BotConfig.balckGroup.includes(Number(e.group_id))) {
    return;
  }
  if (groupConfig[e.group_id]) {
    e.groupConfig = groupConfig[e.group_id];
  }
  if (!e.groupConfig) {
    e.groupConfig = groupConfig.default;
  }

  e.reply = (msg) => {
    redis.incr(`Yunzai:sendMsgNum:${BotConfig.account.qq}`);
    return e.group.sendMsg(msg);
  };

  switch (e.sub_type) {
    case "poke":
      await dealPoke(e);
      break;
    case "increase":
      dealIncrease(e);
      break;
    case "ban":
      dealBan(e);
      break;
  }
}

/**
 * 戳一戳
 */
async function dealPoke(e) {
  if (typeof YunzaiApps == "undefined") {
    return;
  }
  if (e.group.mute_left > 0) {
    return;
  }
  e.isPoke = true;
  e.user_id = e.operator_id;

  if (e.target_id != BotConfig.account.qq) {
    return;
  }
  if (e.groupConfig.disable) {
    if (e.groupConfig.disable.includes("all")) {
      return;
    }
    if (e.groupConfig.disable.includes("mysInfo")) {
      return;
    }
    if (e.groupConfig.disable.includes("poke")) {
      return;
    }
  }

  //黑名单
  if (BotConfig.balckQQ && BotConfig.balckQQ.includes(Number(e.user_id))) {
    return;
  }

  //主人qq
  if (BotConfig.masterQQ && BotConfig.masterQQ.includes(Number(e.user_id))) {
    e.isMaster = true;
  }

  if (!checkLimit(e)) {
    if (PokeCD[e.group_id] <= 1 && !e.isMaster) {
      e.reply([segment.at(e.user_id), "\n戳太快，冷却中。。"]);
    }

    if (PokeCD[e.group_id]) {
      PokeCD[e.group_id]++;
    }
    return;
  }

  setLimit(e);

  e.sender = { card: "" };

  e.msg = "#poke#";
  return await dealMsg(e);

  /*
  // 为e绑定checkMsg
  e.getMysApi = async function (cfg) {
    return await Msg.getMysApi(e, cfg);
  }
  e.checkAuth = async function (cfg) {
    return await Msg.checkAuth(e, cfg);
  }

  if (global.pokeCharacter) {
    global.pokeCharacter(e);
  } else {
    YunzaiApps.mysInfo.pokeCharacter(e);
  }*/
}

/**
 * 好友请求通知，默认自动同意
 */
function dealFriend(e) {
  if (e.sub_type == "add" || e.sub_type == "single") {
    Bot.logger.mark(`添加好友：${e.user_id}`);
    //自动同意添加好友
    if (typeof BotConfig.account.autoFriend == "undefined" || BotConfig.account.autoFriend == 1) {
      e.approve(true);
    }
  }
}

/**
 * 群请求通知，邀请加群
 * 主人邀请自动同意
 */
function dealGroupRequest(e) {
  if (e.sub_type == "invite") {
    if (!BotConfig.masterQQ || !BotConfig.masterQQ.includes(Number(e.user_id))) {
      Bot.logger.mark(`邀请加群：${e.group_name}：${e.group_id}`);
      return;
    }
    Bot.logger.mark(`主人邀请加群：${e.group_name}：${e.group_id}`);
    e.approve(true);
    Bot.sendPrivateMsg(e.user_id, `已同意加群：${e.group_name}`).catch((err) => {
      Bot.logger.error(err);
    });
  }
}

/**
 * 禁言
 */
function dealBan(e) {
}

/**
 * 新人加入
 */
async function dealIncrease(e) {

  if (e.user_id == BotConfig.account.qq) {
    let gl = await e.group.getMemberMap();
    let hasMaster = false;
    for (let qq of BotConfig.masterQQ) {
      if (gl.has(qq)) {
        hasMaster = true;
        break;
      }
    }
    if (Array.from(gl).length <= 50 && !hasMaster && BotConfig.account?.autoQuit == 1) {
      e.group.quit();
    }
    return;
  }

  if (e.groupConfig.disable?.includes("all")) {
    return;
  }
  if (e.groupConfig.disable?.includes("newcomers")) {
    return;
  }
  YunzaiApps.newcomers.newcomers(e).catch((err) => {
    Bot.logger.error(err);
  });
}

export default { dealMsg, dealGroupNotice, dealFriend, dealGroupRequest };
