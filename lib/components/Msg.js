import { User, MysUser, MysApi } from "./models/index.js";
import { segment } from "oicq";
import lodash from "lodash";

let Msg = {};
// const cookieDoc = "https://docs.qq.com/doc/DUWNVQVFTU3liTVlO";


/*
* 统一实现需要绑定cookie的方法
* 收敛调用
* */
Msg.replyNeedCookie = function (e, replyMsg) {

  replyMsg = replyMsg || `您尚未绑定米游社cookie，无法进行操作`;

  let helpMsg = `配置cookie教程：${BotConfig.cookieDoc}`;

  if (e.isGroup) {
    // replyMsg = segment.image(`file:///${_path}/resources/help/help.png`);
    e.reply([replyMsg, "\n", helpMsg]);
  } else {
    e.reply(replyMsg);
    e.reply(helpMsg);
  }

  return false;
}

// 获取当前请求的用户实例
Msg.getSelfUser = async function (e) {
  if (!e.selfUser) {
    e.selfUser = await User.get(e.user_id);
  }
  return e.selfUser;
}

/*
* 获取当前消息所查询的 MysUser
*
* 策略：优先级依次递减
* 1. 消息里包含 uid
* 2. 存在 msg.at，且msg.at 用户存在绑定 MysUser
* 3. 存在 msg.at 且msg.at 名片包含uid
* 4. 当前用户为绑定用户
* 5. 当前用户名片包含 uid
* */
Msg.getTargetMysUser = async function (e, cfg = {}) {

  let targetType = cfg.targetType || "uid";

  let targetUid, targetUser, mysUser;

  if (cfg.targetType === "self") {
    let selfMysUser = await e.selfUser.getMysUser();

    if (selfMysUser) {
      targetUid = selfMysUser.uid;
    }
  }
  /*-- 有指定的查询目标 --*/

  /* 消息里包含 uid的话优先匹配 */
  if (e.msg && !targetUid) {
    targetUid = matchUid(e.msg);
    if (targetUid) {
      let mysUser = await MysUser.get(targetUid);
      if (!mysUser) {
        // ('getMysUser fail, uid', targetUid)
      }
      // 将查询记录绑定至当前用户
      await e.selfUser.regMysUser(mysUser, false);
      return mysUser;
    }
  }

  // 如果有at的用户，使用被at的用户
  if (e.at && e.at != BotConfig.account.qq && !targetUid) {
    targetUser = await User.get(e.at);
    let targetMysUser = await targetUser.getMysUser();
    if (targetMysUser) return targetMysUser;
  }

  // 不存在主动查询则使用自身作为 targetMysUser

  if (e.selfUser) {
    // 获取当前用户的mysUser，包括uid 及 cookie 级别用户
    mysUser = await e.selfUser.getMysUser();
    if (mysUser) return mysUser;
  }

  if (e.sender && e.sender.card) {
    // 使用角色卡片资料查询
    targetUid = matchUid(e.sender.card.toString());
    if (targetUid) {
      let mysUser = MysUser.get(targetUid);
      if (mysUser) {
        e.selfUser.regMysUser(mysUser);
        return mysUser;
      }
    }
  }

  return false;
}

/*
* 对当前用户的类型进行检查，并对不符合条件的用户进行回复
* 对于通过的返回MysUser实例
*
* cfg.auth: 何种用户可以发起此命令，校验权限，默认all
*   * all: 全部用户可用
*   * uid: 有uid的用户可用（绑定过uid / 名片能够识别uid / 绑定过cookie）, 如无法识别则会进行提示
*   * cookie：有cookie的用户可用 （绑定过体力cookie）
*   * master: 管理员可用
*
* cfg.targetType： 查询目标可以是什么样的人，默认all
*   * all: 有uid的用户 默认
*   * cookie： 有cookie的用户
*   * self: 自身
*
* cfg.cookieType：使用什么样的cookie进行查询，默认all
*   * all: 有效cookie均可
*   * self：只有【被查询对象】自身的cookie可用，要求被查询对象有cookie
*
* cfg.actionName: 操作的名称，如果配置了会在返回提示中进行提示
*
* */
Msg.getMysApi = async function (e, cfg) {
  let {
    auth = "all",
    targetType = "all",
    cookieType = "all",
  } = cfg;
  let typeKey = `${auth}.${targetType}.${cookieType}`;
  e._mysApi = e._mysApi || {};
  if (e._mysApi[typeKey]) return e._mysApi[typeKey];

  let checkRet = await Msg.checkAuth(e, cfg);
  if (!checkRet) return false;

  // 获取查询用户
  // 此用户为MysUser实例
  let targetUser = await Msg.getTargetMysUser(e, cfg);

  // 不存在查询对象，也未能识别发信息的人
  if (!targetUser) {
    // todo 待完善场景以丰富文案
    e.reply("请通过【#绑定+uid】命令绑定一个UID，或者私聊发送Cookie以绑定Cookie");
    return false;
  }

  e.targetUser = targetUser;
  e.targetUid = targetUser.uid;

  let isNew = await MysUser.isNewTarget(targetUser);
  if (isNew && !await e.selfUser.checkLimit(e.groupConfig.mysUidLimit)) {
    let name = lodash.truncate(e.sender.card, { length: 8 });
    e.reply([segment.at(e.user_id, name),
      `\n您尚未绑定Cookie，今日查询UID个数已达上限(${e.groupConfig.mysUidLimit})，【私聊】机器人绑定Cookie后可查询更多UID，Cookie获取方式：${BotConfig.cookieDoc}`]);
    return false;
  }


  // 获取提供cookie的请求用户
  // 此用户为MysUser实例
  let cookieUser = await Msg.getCookieUser(e, cfg)
  if (!cookieUser) {
    console.log("暂无可用Cookie，请绑定更多Cookie...");
    return false;
  }
  if (!await cookieUser.getCookie()) {
    e.reply("暂未配置公共查询cookie，无法查询");
    return false;
  }
  e.cookieUser = cookieUser;
  e.isSelfCookie = targetUser.uid === cookieUser.uid;

  e._mysApi[typeKey] = MysApi.init(e);
  return e._mysApi[typeKey];
};

Msg.checkAuth = async function (e, cfg) {
  await MysUser.init();

  // 获取自身用户
  // 此用户为User实例
  let selfUser = await Msg.getSelfUser(e);
  e.selfUser = selfUser;

  // 检查当前用户权限
  if (!await checkAuth(e, selfUser, cfg)) return false;
  return e.selfUser;
}


/*
* 获取当前 MysApi 的最佳查询User
*
* 策略，优先级依次递减 （ sUid 在下方代指被查询的Uid ）
* 1. 如果 targetUser 为cookie用户，优先使用绑定用户自身的 cookie
* 2. 如果 targetUser 今天被查询过，优先使用曾经查询过的uid的 cookie
* 3. 使用系统分配，
*
* */
Msg.getCookieUser = async function (e, cfg) {
  let { cookieType } = cfg;
  let { targetUser } = e;

  if (cookieType === "self") {
    // 只有自身的cookie才能使用
    if (!targetUser.cookie) {
      // todo 完善提示
      Msg.replyNeedCookie(e, `UID:${targetUser.uid}尚未绑定Cookie`);
      return false;
    }
    return targetUser;
  }

  // 不允许全局使用NoteCookie时，若当前用户为Cookie用户，优先使用自身Cookie
  if ((!BotConfig.allowUseNoteCookie) && e.selfUser.isCookieUser) {
    let mUser = await e.selfUser.getMysUser();
    if (!await mUser.isDisable()) {
      return mUser;
    }
  }

  // cookieType == all 下，由MysUser分配查询cookie
  let cookieUser = await MysUser.getCookieUser(targetUser);
  if (!cookieUser) {
    Msg.replyNeedCookie(e);
    return false;
  }

  return cookieUser;
};


const matchUid = function (msg) {
  let ret = /[1|2|5][0-9]{8}/g.exec(msg);
  if (ret) {
    return ret[0];
  }
  return false;
};


// 检查权限
const checkAuth = async function (e, selfUser, cfg) {
  let {
    auth = "all",
    actionName = "进行操作",
    replyMsg = "",
  } = cfg;

  let self = e.selfUser;

  switch (auth) {
    case 'cookie':
      // 需要是绑定用户
      if (!self.isCookieUser) {
        if (!replyMsg) {
          actionName = actionName || "进行操作";
          replyMsg = `您尚未绑定米游社cookie，无法${actionName}`;
        }
        Msg.replyNeedCookie(e, replyMsg);
        return false;
      }
      break;
    case 'admin':
    case 'master':
      if (!self.isMaster) {
        // 如果主动传递了replyMsg则进行回复，否则静默
        if (replyMsg) {
          e.reply(replyMsg)
        }
        return false;
      }
      break;
    case 'all':
    case 'self':
      //不检查权限
      return self;
    default:
      return false;
  }
  return self;
}

export default Msg;