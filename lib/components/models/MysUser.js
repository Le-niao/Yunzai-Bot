import BaseModel from "./BaseModel.js"
import lodash from "lodash";
import fetch from "node-fetch";

const countKey = "genshin:uid-query-count";
const detailKey = "genshin:uid-query-detail";
const statusKey = "genshin:uid-query-status";
const delKey = "genshin:uid-del-detail";
const cookieKey = "genshin:uid-ck";
const ckidKey = "genshin:cktk-uid";

const userInstanceReclaimTime = 60 * 30 * 1000;

let mysUserMap = {};

class MysUser extends BaseModel {
  constructor(uid, cookie) {
    super();
    if (mysUserMap[uid]) {
      return mysUserMap[uid]._reclaim();
    }
    this._uid = uid;
    this._cookie = cookie;
    return this._reclaim();
  }

  toString() {
    return this.uid;
  }

  get uid() {
    return this._uid * 1 || 0;
  }

  get cookie() {
    return this._cookie || '';
  }

  async getCookie() {
    if (!this._cookie) {
      let cookie = await redis.get(`${cookieKey}:${this.uid}`);
      if (cookie) {
        this._cookie = cookie;
      }
    }
    return this._cookie;
  }

  set uid(uid) {
    this._uid = uid * 1;
  }

  setCookie(cookie) {
    if (cookie) {
      this._cookie = cookie;
    }
  }

  // 向当前mysUser增加对uid的请求记录
  async addQuery(targetUser) {
    let uid = getUid(targetUser);
    if (!uid || !this.uid) {
      return;
    }
    let isNew = await MysUser.isNewTarget(targetUser);
    await redis.zAdd(detailKey, { score: this.uid, value: uid + '' });
    Bot.logger.debug(`uid:${this.uid} 添加请求记录uid：${uid} 成功`);
    await this.refreshQueryCount();
    return isNew;
  }

  // 本次请求失败，将增加的请求记录删除
  // 并将当前mysUser置为超限，不在分配新的请求（请求过的uid仍有效）
  async disableToday(targetUser) {
    let uid = getUid(targetUser);

    //await redis.zScore(countKey, uid);
    await redis.zRem(detailKey, uid + '');
    Bot.logger.debug(`标记请求错误，删除UID：${this.uid}对账号UID：${uid}的查询记录`);

    // 如果请求失败，则将自身置为不可用
    await redis.zAdd(countKey, { score: 99, value: this.uid + '' });
    Bot.logger.debug(`将账号UID：${this.uid}今日标记为不可用`);
  }

  // 判定当前用户是否为禁用
  async isDisable() {
    let count = await this.getQueryCount();
    return count > 27;
  }

  /*
  * 获取当前用户请求过的uid列表
  *
  * retType: normal uid的列表 [12345, 67890]
  * retType: set sorted set 格式 [{score: this.uid, value: 12345}, {sorce:this.uid, value:67890}]
  * */
  async getQueryList(retType = 'normal') {
    let history = await redis.zRangeByScore(detailKey, this.uid, this.uid);
    if (retType === 'normal') {
      return history;
    }
    let ret = [];
    for (let value of history) {
      ret.push({ score: this.uid, value: value + '' });
    }
    return ret;
  }

  /*
  * 获取当前MysUser查询uid的个数
  *
  * calc：false为使用缓存，calc为直接计算
  * */
  async getQueryCount(calc = false) {

    if (!calc) {
      let count = await redis.zScore(countKey, this.uid + '');
      return count || 0;
    }

    let queryList = await redis.zRangeByScore(detailKey, this.uid, this.uid);
    return queryList ? queryList.length : 0;
  }

  /*
  *  更新当前用户计数缓存
  * force: 忽略无效，强制更新
  * */
  async refreshQueryCount(force = false) {
    // 检查当前uid是否超限
    let currCount = await this.getQueryCount();
    if (currCount > 30 && !force) {
      return;
    }

    // 从detail记录中查找记录并进行更新
    let queryCount = await this.getQueryCount(true);
    await redis.zAdd(countKey, { score: queryCount, value: this.uid + '' });
    Bot.logger.debug(`UID:${this.uid} 记录刷新, 计数：${queryCount}`);
  }

  /* 设置当前用户的缓存数据，初始化
  * setToQueryPool : 是否将当前MysUser加到查询池中
  * */
  async setCache(setToQueryPool = false) {

    Bot.logger.debug(`UID:${this.uid}添加至请求池`);
    if (!this.uid) {
      return;
    }

    // 设置当前Uid的记录
    await redis.zAdd(detailKey, { score: this.uid, value: this.uid + '' });

    // 设置当前Uid的Cookie缓存记录
    if (this.cookie) {
      await redis.set(`${cookieKey}:${this.uid}`, this.cookie, { EX: 3600 * 24 * 30 });
    }

    // 从删除记录中查找并恢复查询记录
    let cacheSearchList = await redis.zRangeByScore(delKey, this.uid, this.uid);

    // 这里不直接插入，只插入当前查询记录中没有的值
    if (cacheSearchList) {
      for (let searchedUid of cacheSearchList) {
        // 检查对应uid是否有新的查询记录
        let sourceUid = await redis.zScore(detailKey, searchedUid + '');
        // 如无新的查询记录，则恢复与当前UID的查询记录关系
        if (!sourceUid) {
          await redis.zAdd(detailKey, { score: this.uid, value: searchedUid + '' })
        }
      }
    }

    // 将当前记录增加至查询计数缓存中
    if (setToQueryPool) {
      let queryList = await redis.zRangeByScore(detailKey, this.uid, this.uid);
      await redis.zAdd(countKey, { score: queryList.length, value: this.uid + '' });
    }
  }

  /*
  * 清空当前用户的cache记录
  * */
  async delCache() {
    // 将统计中的该用户标记为为失效
    await redis.zAdd(countKey, { score: 99, value: this.uid + '' });

    // 获取用户已经请求的记录，缓存至今日结束
    // 如果今日内用户重新绑定，则恢复请求的uid列表
    let queryUidList = await this.getQueryList('set');
    if (queryUidList && queryUidList.length > 0) {
      await redis.zAdd(delKey, queryUidList);
    }

    // 在detail中删除用户已经请求的UID记录
    await redis.zRemRangeByScore(detailKey, this.uid, this.uid);

    Bot.logger.debug(`UID:${this.uid}已失效，删除所有请求记录`);
  }

  /*
  * 删除当前 MysUser 记录
  * */
  async del() {
    // 清除缓存记录
    await this.delCache();
    delete mysUserMap[this.uid];
    Bot.logger.debug(`UID:${this.uid}已删除缓存`);
  }

  _reclaim() {
    clearTimeout(this._reclaimFn);
    this._reclaimFn = setTimeout(() => {
      delete mysUserMap[this.uid];
      Bot.logger.debug(`UID:${this.uid} 已回收 `)
    }, userInstanceReclaimTime);
    mysUserMap[this.uid] = this;
    return this;
  }
}

// 初始化检查
MysUser.init = async function (uids, updateStat = false) {
  // 检查 redis 记录状态
  let status = await redis.get(statusKey);
  if (status) {
    return true;
  }

  // 删除所有MysUser缓存
  await MysUser._delCache();

  Bot.logger.mark(`MysUser缓存失效，重建缓存...`);
  // 标记缓存生效，截止到今日结束
  await redis.set(statusKey, "alive", { EX: getDayEnd() });

  // 重新构建NoteCookie用户的缓存
  for (let nid in NoteCookie) {
    await MysUser.addNote(NoteCookie[nid], !!BotConfig.allowUseNoteCookie);
  }

  // 设置BotConfig.mysCookies机器人Cookie
  for (let cookie of BotConfig.mysCookies) {
    await MysUser.addBotCookie(cookie);
  }

  Bot.logger.mark(`MysUser缓存重建完成...`);

};

MysUser.get = async function (uid, cookie = '') {
  let mUser;
  if (mysUserMap[uid]) {
    mUser = mysUserMap[uid];
    if (cookie) {
      mUser.setCookie(cookie);
    }
    return mUser._reclaim();
  }

  if (uid) {
    if (!cookie) {
      cookie = await redis.get(`${cookieKey}:${uid}`);
    }

    let currUser = new MysUser(uid, cookie);
    await currUser.setCookie(cookie);
    return currUser;
  }

  if (cookie) {

  }
  return false;
};


// 删除指定 uid 记录
MysUser.del = async function (uid) {
  let mUser = await MysUser.get(uid);
  mUser && await mUser.del();
};

// 对删除NoteCookie的处理
MysUser.delNote = async function (note = {}) {
  if (note.uid) {
    await MysUser.del(note.uid);
  }
};

/* 添加Note记录，Note需包含uid及cookie
* setToQueryPool： 是否添加到请求池
* */

MysUser.addNote = async function (note, setToQueryPool = false) {
  if (note.uid) {
    let mUser = await MysUser.get(note.uid, note.cookie);
    if (mUser) {
      mUser._cookie = note.cookie;
      await mUser.setCache(setToQueryPool);
    }
    return mUser;
  }
};

// 根据cookie删除MysUser缓存
MysUser.delBotCookie = async function (cookie) {
  let uid = await MysUser.getUidByCookie(cookie);
  if (uid) {
    let mUser = await MysUser.get(uid, cookie);
    mUser && await mUser.del();
  }
};

// 根据cookie添加MysUser缓存
MysUser.addBotCookie = async function (cookie) {
  let uid = await MysUser.getUidByCookie(cookie);
  if (uid) {
    let mUser = await MysUser.get(uid, cookie);
    mUser && await mUser.setCache(true);
  }
};

// 获取最佳请求uid
MysUser.getCookieUser = async function (targetUser) {
  let targetUid = getUid(targetUser);

  // 从已经查询过的记录中查询
  let reqUid = await redis.zScore(detailKey, targetUid + '');
  if (reqUid) {
    // 查找到则返回
    Bot.logger.debug(`目标UID：${targetUid},【已存在查询记录】：使用上一次查询过的Cookie UID：${reqUid}`)
    return await MysUser.get(reqUid);
  }

  // 根据现有查询池，分配使用次数最少的查询cookie用户
  let bestUidList = await redis.zRangeByScore(countKey, 0, 27, true);
  if (!bestUidList || !bestUidList.length) return false;

  let bestUid = bestUidList[0];
  Bot.logger.debug(`目标UID：${targetUid},【新查询】：分配当前使用次数最少的CookieUID：${bestUid}`);
  return await MysUser.get(bestUid);
};

// 删除全部缓存
MysUser._delCache = async function () {
  await redis.del(statusKey);
  await redis.del(detailKey);
  await redis.del(countKey);
  await redis.del(delKey);
  mysUserMap = {};
};


const getUid = function (mysUser) {

  if (/^(\s|\d)*$/.test(mysUser)) {
    return mysUser * 1;
  }
  if (mysUser.uid) return mysUser.uid;
  return 0;
}

MysUser.getAll = async function () {
  let userList = await redis.zRangeByScore(countKey, 0, 100);
  let ret = [];

  for (let idx in userList) {
    let user = userList[idx];
    let count = await redis.zScore(countKey, user + '');
    ret.push({ uid: user, count, status: count > 30 ? 1 : 0 })
  }
  return ret;
}

MysUser.getUidByCookie = async function (cookie = '') {

  if (!cookie.includes("ltoken")) {
    return false;
  }

  cookie = cookie.replace(/#|\'|\"/g, "") + ";";
  let param = cookie.match(/ltoken=([^;]+;)|ltuid=(\w{0,9})|cookie_token=([^;]+;)/g);

  if (!param) {
    return false;
  }

  let token = {};
  for (let val of param) {
    let tmp = val.split("=");
    token[tmp[0]] = tmp[1];
  }

  //有些cookie没有cookie_token
  let _ckidKey;
  if (token.cookie_token) {
    _ckidKey = `${ckidKey}:${token.cookie_token}`;
  } else {
    _ckidKey = `${ckidKey}:${token.ltoken}`;
  }

  let uid = await redis.get(_ckidKey);
  if (uid) {
    return uid;
  }


  let ltoken = `ltoken=${token["ltoken"]}ltuid=${token["ltuid"]};`;
  let cookie_token = `cookie_token=${token["cookie_token"]} account_id=${token["ltuid"]};`;
  ltoken += cookie_token;

  let headers = {
    Cookie: ltoken,
  };

  let host = "https://api-takumi.mihoyo.com/";
  let url = host + "binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn";

  const response = await fetch(url, { method: "get", headers });
  if (!response.ok) {
    // e.reply("米游社接口错误");
    await redis.del(_ckidKey);
    return true;
  }
  const res = await response.json();

  if (res.retcode != 0) {
    // e.reply(`体力cookie错误：${res.message}`);
    await redis.del(_ckidKey);
    return false;
  }

  for (let val of res.data.list) {
    //米游社默认展示的角色
    if (val.is_chosen) {
      uid = val.game_uid;
      break;
    }
  }

  if (!uid) {
    //没有创建角色的ck用米游社uid代替
    if (!res.data.list || res.data.list.length <= 0) {
      uid = token.ltuid * 10000;
    } else {
      uid = res.data.list[0].game_uid;
    }
  }

  if(!uid) return false;

  await redis.set(_ckidKey, uid + '', { EX: 3600 * 24 * 30 });
  return uid;
}

MysUser.isNewTarget = async function (targetUser) {
  let uid = typeof targetUser == "object" ? targetUser.uid : targetUser;
  return !await redis.zScore(detailKey, uid + '');
};

function getDayEnd() {
  let now = new Date();
  let dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), "23", "59", "59").getTime() / 1000;
  return dayEnd - parseInt(now.getTime() / 1000);

}


export default MysUser;
