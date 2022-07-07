import fetch from "node-fetch";
import { segment } from "oicq";
import { render } from "../render.js";
import lodash from "lodash";
import fs from "fs";
import format from "date-format";
import common from "../common.js";
import { getUrl } from "./mysApi.js";
import { MysUser } from "../components/models/index.js";

export const rule = {
  role: {
    reg: "^#(角色2|宝箱|成就|尘歌壶|家园|探索|探险|声望|探险度|探索度)[ |0-9]*$",
    priority: 200,
    describe: "【#探索，#声望】展示原神角色大地图探险数据",
  },
  roleCard: {
    reg: "^(#*角色3|#*角色卡片|角色)$", //匹配的正则
    priority: 201, //优先级，越小优先度越高
    describe: "【#角色卡片，角色】展示原神角色数据卡片，横向",
  },
  roleAll: {
    reg: "(^#(角色|查询|查询角色|角色查询|人物)[ |0-9]*$)|(^(#*uid|#*UID)\\+*[1|2|5][0-9]{8}$)|(^#[\\+|＋]*[1|2|5][0-9]{8})",
    priority: 202,
    describe: "【#角色，#104070461】展示原神角色数据，竖向",
  },
  abyssFloor: {
    reg: "^#*[上期|往期|本期]*(深渊|深境|深境螺旋)[上期|往期|本期]*[第]*(9|10|11|12|九|十|十一|十二)层[ |0-9]*$",
    priority: 203,
    describe: "【#深渊十二层】深境层数数据，竖向",
  },
  abyss: {
    reg: "#[上期|往期|本期]*(深渊|深境|深境螺旋)[上期|往期|本期]*[ |0-9]*$",
    priority: 204,
    describe: "【#深渊】深境数据",
  },
  weapon: {
    reg: "^#[五星|四星|5星|4星]*武器$",
    priority: 205,
    describe: "【#武器】武器列表，只角色已装备",
  },
  life: {
    reg: "^#(五星|四星|5星|4星|命座|角色|武器)[命座|角色]*[信息|阵容]*[ |0-9]*$",
    priority: 206,
    describe: "【#四星，#五星】角色列表",
  },
  wife: {
    reg: "^#(老婆|妻子|媳妇|娘子|女朋友|女友|女神|老公|丈夫|夫君|郎君|男朋友|男友|男神|女儿|儿子)(1|2)*$",
    priority: 207,
    describe: "【#老婆，#老公，#女儿】角色详情",
  },
  character2: {
    reg: "#*(.*)卡片|^#(.*)2$",
    priority: 208,
    describe: "【#刻晴卡片】角色详情",
  },
  character: {
    reg: "",
    priority: 209,
    describe: "【#刻晴】角色详情",
  },
  pokeCharacter: {
    reg: "#poke#",
    priority: 210,
    describe: "【戳一戳】随机角色卡片",
  },
  checkCookie: {
    reg: "^#*检查(ck|cookie)$",
    priority: 210,
    describe: "【检查ck】检查已配置的cookie",
  },
  setCookie: {
    reg: "^#*配置(.*)$",
    priority: 211,
    describe: "【配置cookie】配置cookie",
  },
  todayQuery: {
    reg: "^#(今日|今天|每日|我的)*(素材|材料|天赋)$",
    priority: 6000,
    describe: "【#今日素材】查看今天可以刷什么角色的",
  },
  talentList: {
    reg: "^#*(我的)*(技能|天赋|武器|角色|练度|五|四|5|4|星)+(汇总|统计|列表)(force|五|四|5|4|星)*[ |0-9]*$",
    priority: 206,
    describe: "【#技能列表、#练度统计】查看所有角色技能列表",
  }
};

for (let val of ["abyss", "abyssFloor", "character", "character2", "life", "role", "roleAll", "weapon", "roleCard", "todayQuery", "talentList"]) {
  //创建html文件夹
  if (!fs.existsSync(`./data/html/genshin/${val}/`)) {
    fs.mkdirSync(`./data/html/genshin/${val}/`);
  }
}

//角色昵称
let nameID = "";

let element = {}, genshin = {}, daily = {};

let areaName = {
  3: "雪山",
  6: "层岩巨渊",
  7: "层岩地下",
};

await init();

export async function init(isUpdate = false) {
  element = JSON.parse(fs.readFileSync("./config/genshin/element.json", "utf8"));
  daily = JSON.parse(fs.readFileSync("./config/genshin/daily.json", "utf8"));
  let version = isUpdate ? new Date().getTime() : 0;
  genshin = await import(`../../config/genshin/roleId.js?version=${version}`);
  nameID = "";
}

/*
* 统一调用 e.getMysApi
* allowQueryOther: 是否允许查他人，默认允许
* */
async function getMysApi(e, allowQueryOther = true) {
  return await e.getMysApi({
    auth: "all", // 所有用户均可查询
    targetType: allowQueryOther ? "all" : "self", // 被查询用户可以是任意用户
    cookieType: "all" // cookie可以是任意可用cookie
  });
}

//#角色
export async function roleAll(e) {
  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let resIndex = MysApi.getIndex();
  let resAbyss = MysApi.getSpiralAbyss(1);
  let resDetail = MysApi.getCharacter();

  try {
    [resIndex, resAbyss, resDetail] = await Promise.all([resIndex, resAbyss, resDetail]);
  } catch (error) {
    return true;
  }
  if (!(resIndex && resAbyss && resDetail)) {
    return true;
  }

  let avatars = resDetail.avatars || [];
  let roleArr = avatars;

  for (let i in avatars) {
    let rarity = avatars[i].rarity;
    let actived_constellation_num = avatars[i].actived_constellation_num;
    let level = avatars[i].level;
    let id = avatars[i].id - 10000000;

    if (rarity >= 5) {
      rarity = 5;
    }
    //埃洛伊排到最后
    if (rarity > 5) {
      id = 0;
    }
    //增加神里排序
    if (avatars[i].id == 10000002) {
      id = 50;
    }

    if (avatars[i].id == 10000005) {
      avatars[i].name = "空";
      actived_constellation_num = 0;
      level = 0;
    } else if (avatars[i].id == 10000007) {
      avatars[i].name = "荧";
      actived_constellation_num = 0;
      level = 0;
    }
    avatars[i].sortLevel = level;
    //id倒序，最新出的角色拍前面
    avatars[i].sort = rarity * 100000 + actived_constellation_num * 10000 + level * 100 + id;

    avatars[i].weapon.showName = genshin.abbr[avatars[i].weapon.name] ? genshin.abbr[avatars[i].weapon.name] : avatars[i].weapon.name;

    avatars[i].costumesLogo = "";
    if (avatars[i].costumes && avatars[i].costumes.length >= 1) {
      for (let val of avatars[i].costumes) {
        if (genshin.costumes.includes(val.name)) {
          avatars[i].costumesLogo = 2;
          break;
        }
      }
    }
  }

  let stats = resIndex.stats || {};
  let line = [
    [
      { lable: "成就", num: stats.achievement_number },
      { lable: "角色数", num: stats.avatar_number },
      {
        lable: "总宝箱",
        num:
          stats.precious_chest_number +
          stats.luxurious_chest_number +
          stats.exquisite_chest_number +
          stats.common_chest_number +
          stats.magic_chest_number,
      },
      { lable: "深境螺旋", num: stats.spiral_abyss },
    ],
    [
      { lable: "华丽宝箱", num: stats.luxurious_chest_number },
      { lable: "珍贵宝箱", num: stats.precious_chest_number },
      { lable: "精致宝箱", num: stats.exquisite_chest_number },
      { lable: "普通宝箱", num: stats.common_chest_number },
    ],
  ];

  //尘歌壶
  let homes_level = 0;
  let homes_item = 0;
  if (resIndex.homes && resIndex.homes.length > 0) {
    homes_level = resIndex.homes[0].level;
    homes_item = resIndex.homes[0].item_num;
  }

  resIndex.world_explorations = lodash.orderBy(resIndex.world_explorations, ["id"], ["desc"]);

  let explor = [];
  let explor2 = [];
  for (let val of resIndex.world_explorations) {
    val.name = areaName[val.id] ? areaName[val.id] : lodash.truncate(val.name, { length: 6 });

    let tmp = { lable: val.name, num: `${val.exploration_percentage / 10}%` };

    if ([6, 5, 4, 3].includes(val.id)) {
      explor.push(tmp);
    }
    if ([1, 2].includes(val.id)) {
      explor2.push(tmp);
    }
  }

  if (!lodash.find(explor, (o) => {
    return o.lable == '渊下宫'
  })) {
    explor.unshift({ lable: '渊下宫', num: '0%' });
  }
  //没有层岩强制补上
  if (!lodash.find(explor, (o) => {
    return o.lable == '层岩巨渊'
  })) {
    explor.unshift({ lable: '层岩巨渊', num: '0%' });
  }
  if (!lodash.find(explor, (o) => {
    return o.lable == '雪山'
  })) {
    explor.unshift({ lable: '雪山', num: '0%' });
  }

  explor2 = explor2.concat([
    { lable: "家园等级", num: homes_level },
    { lable: "获得摆设", num: homes_item },
  ]);

  line.push(explor);
  line.push(explor2);

  if (avatars.length > 0) {
    //重新排序
    avatars = lodash.chain(avatars).orderBy(["sortLevel"], ["desc"]);
    if (e.msg.includes("角色") && BotConfig.roleAllAvatar !== true) {
      avatars = avatars.slice(0, 12);
    }
    avatars = avatars.orderBy(["sort"], ["desc"]).value();
  }
  //深渊
  let abyss = await abyssAll(e, uid, roleArr, resAbyss);

  let base64 = await render("genshin", "roleAll", {
    save_id: uid,
    uid: uid,
    activeDay: dayCount(stats.active_day_number),
    line,
    avatars,
    abyss,
    bg: lodash.random(1, 6),
    // msg: e.isSelfCookie ? "" : `UID:${uid} 尚未绑定Cookie，展示信息可能不完全`
  });

  if (base64) {
    let msg = [];
    if (e.isGroup) {
      let name = lodash.truncate(e.sender.card, { length: 8 });
      msg.push(segment.at(e.user_id, name));
    }
    msg.push(segment.image(`base64://${base64}`));

    e.reply(msg);
  }

  return true; //事件结束不再往下
}

//处理深渊数据
async function abyssAll(e, uid, roleArr, resAbyss) {
  let abyss = {};

  if (roleArr.length <= 0) {
    return abyss;
  }
  if (resAbyss.total_battle_times <= 0) {
    return abyss;
  }
  if (resAbyss.reveal_rank.length <= 0) {
    return abyss;
  }
  //打了三层才放出来
  if (resAbyss.floors.length <= 2) {
    return abyss;
  }

  let start_time = new Date(resAbyss.start_time * 1000);
  let time = start_time.getMonth() + 1;
  if (start_time.getDate() >= 15) {
    time = time + "月下";
  } else {
    time = time + "月上";
  }

  let total_star = 0;
  let star = [];
  for (let val of resAbyss.floors) {
    if (val.index < 9) {
      continue;
    }
    total_star += val.star;
    star.push(val.star);
  }
  total_star = total_star + "（" + star.join("-") + "）";

  let dataName = ["damage", "take_damage", "defeat", "normal_skill", "energy_skill"];
  let data = [];
  let tmpRole = [];
  for (let val of dataName) {
    if (resAbyss[`${val}_rank`].length <= 0) {
      resAbyss[`${val}_rank`] = [
        {
          value: 0,
          avatar_id: 10000007,
        },
      ];
    }
    data[val] = {
      num: resAbyss[`${val}_rank`][0].value,
      name: roleIdToName(resAbyss[`${val}_rank`][0].avatar_id, true),
    };

    if (data[val].num > 1000) {
      data[val].num = (data[val].num / 10000).toFixed(1);
      data[val].num += " w";
    }

    if (tmpRole.length < 4 && !tmpRole.includes(resAbyss[`${val}_rank`][0].avatar_id)) {
      tmpRole.push(resAbyss[`${val}_rank`][0].avatar_id);
    }
  }

  let list = [];

  let avatar = lodash.keyBy(roleArr, "id");

  for (let val of resAbyss.reveal_rank) {
    if (avatar[val.avatar_id]) {
      val.life = avatar[val.avatar_id].actived_constellation_num;
    } else {
      val.life = 0;
    }
    val.name = roleIdToName(val.avatar_id, true);
    list.push(val);
  }

  return {
    time,
    max_floor: resAbyss.max_floor,
    total_star,
    list,
    total_battle_times: resAbyss.total_battle_times,
    ...data,
  };
}

//#角色2
export async function role(e) {
  e.msg = e.msg.replace(/#角色2/g, "");

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let res = await MysApi.getIndex();
  if (!res) return true;

  let stats = res.stats;
  let line = [
    [
      { lable: "成就", num: stats.achievement_number },
      { lable: "角色数", num: stats.avatar_number },
      {
        lable: "总宝箱",
        num:
          stats.precious_chest_number +
          stats.luxurious_chest_number +
          stats.exquisite_chest_number +
          stats.common_chest_number +
          stats.magic_chest_number,
      },
      { lable: "深境螺旋", num: stats.spiral_abyss },
    ],
    [
      { lable: "华丽宝箱", num: stats.luxurious_chest_number },
      { lable: "珍贵宝箱", num: stats.precious_chest_number },
      { lable: "精致宝箱", num: stats.exquisite_chest_number },
      { lable: "普通宝箱", num: stats.common_chest_number },
    ],
    [
      { lable: "风神瞳", num: stats.anemoculus_number },
      { lable: "岩神瞳", num: stats.geoculus_number },
      { lable: "雷神瞳", num: stats.electroculus_number },
      { lable: "传送点", num: stats.way_point_number },
    ],
  ];
  //尘歌壶
  if (res.homes && res.homes.length > 0) {
    line.push([
      { lable: "家园等级", num: res.homes[0].level },
      { lable: "最高仙力", num: res.homes[0].comfort_num },
      { lable: "获得摆设", num: res.homes[0].item_num },
      { lable: "历史访客", num: res.homes[0].visit_num },
    ]);
  }

  res.world_explorations = lodash.orderBy(res.world_explorations, ["id"], ["desc"]);

  let explor = [];
  for (let val of res.world_explorations) {
    if (val.id == 7) continue;

    val.name = areaName[val.id] ? areaName[val.id] : lodash.truncate(val.name, { length: 6 });

    let tmp = {
      name: val.name,
      line: [
        {
          name: val.name,
          text: `${val.exploration_percentage / 10}%`,
        },
      ],
    };

    if (["蒙德", "璃月", "稻妻", "须弥"].includes(val.name)) {
      tmp.line.push({
        name: "声望",
        text: `${val.level}级`,
      });
    }

    if (val.id == 6) {
      let underground = lodash.find(res.world_explorations, function (o) {
        return o.id == 7;
      });
      if (underground) {
        tmp.line.push({
          name: areaName[underground.id],
          text: `${underground.exploration_percentage / 10}%`,
        });
      }
    }

    if (["雪山", "稻妻", "层岩巨渊"].includes(val.name)) {
      if (val.offerings[0].name.includes("流明石")) {
        val.offerings[0].name = "流明石";
      }

      tmp.line.push({
        name: val.offerings[0].name,
        text: `${val.offerings[0].level}级`,
      });
    }

    explor.push(tmp);
  }

  let base64 = await render("genshin", "role", {
    save_id: uid,
    uid: uid,
    activeDay: dayCount(stats.active_day_number),
    line,
    explor,
    bg: lodash.random(1, 6),
    msg: e.isSelfCookie ? "" : `UID:${uid} 尚未绑定Cookie，展示信息可能不完全`,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

//#角色3 、角色卡片
export async function roleCard(e) {
  e.msg = e.msg.replace(/#角色3/g, "");

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let res = await MysApi.getIndex();
  if (!res) return true;


  let stats = res.stats;
  let line = [
    [
      { lable: "活跃天数", num: stats.active_day_number },
      { lable: "成就", num: stats.achievement_number },
      { lable: "角色数", num: stats.avatar_number },
      {
        lable: "总宝箱",
        num:
          stats.precious_chest_number +
          stats.luxurious_chest_number +
          stats.exquisite_chest_number +
          stats.common_chest_number +
          stats.magic_chest_number,
      },
      { lable: "深境螺旋", num: stats.spiral_abyss },
    ],
    [
      { lable: "华丽宝箱", num: stats.luxurious_chest_number },
      { lable: "珍贵宝箱", num: stats.precious_chest_number },
      { lable: "精致宝箱", num: stats.exquisite_chest_number },
      { lable: "普通宝箱", num: stats.common_chest_number },
      { lable: "奇馈宝箱", num: stats.magic_chest_number },
    ],
  ];

  let explor1 = [];
  let explor2 = [];

  res.world_explorations = lodash.orderBy(res.world_explorations, ["id"], ["desc"]);

  for (let val of res.world_explorations) {
    val.name = areaName[val.id] ? areaName[val.id] : lodash.truncate(val.name, { length: 6 });

    let tmp = { lable: val.name, num: `${val.exploration_percentage / 10}%` };

    if (explor1.length < 5) {
      explor1.push(tmp);
    } else {
      explor2.push(tmp);
    }
  }

  explor2 = explor2.concat([
    { lable: "雷神瞳", num: stats.electroculus_number },
    { lable: "岩神瞳", num: stats.geoculus_number },
    { lable: "风神瞳", num: stats.anemoculus_number },
  ]);

  line.push(explor1);
  line.push(explor2.slice(0, 5));

  let avatars = res.avatars;
  avatars = avatars.slice(0, 8);
  for (let i in avatars) {
    if (avatars[i].id == 10000005) {
      avatars[i].name = "空";
    }
    if (avatars[i].id == 10000007) {
      avatars[i].name = "荧";
    }

    avatars[i].element = element[avatars[i].name];
  }

  let base64 = await render(
    "genshin",
    "roleCard",
    {
      save_id: uid,
      uid: uid,
      name: e.sender.card.replace(uid, "").trim(),
      user_id: e.user_id,
      line: line,
      avatars: avatars,
      bg: lodash.random(1, 3),
      msg: e.isSelfCookie ? "" : `UID:${uid} 尚未绑定Cookie，展示信息可能不完全`,
    }
  );

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

//#深境
export async function abyss(e) {
  e.msg = e.msg.replace(/#角色2/g, "");

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  //调角色数据接口刷新深渊数据
  let role = await MysApi.getIndex();
  if (!role) return true;

  let roleArr = [];

  for (let val of role.avatars) {
    roleArr[val.id] = val;
  }

  let schedule_type = 1;
  if (e.msg.includes("上期") || e.msg.includes("往期")) {
    schedule_type = 2;
  }

  let res = await MysApi.getSpiralAbyss(schedule_type);
  if (!res) return true;

  if (res.total_battle_times <= 0) {
    e.reply("暂无挑战数据。");
    return true;
  }
  if (!res.damage_rank || res.damage_rank.length <= 0) {
    e.reply("数据还没更新，请稍后再试");
    return true;
  }

  let start_time = new Date(res.start_time * 1000);
  let time = start_time.getMonth() + 1;
  if (start_time.getDate() >= 15) {
    time = time + "月下";
  } else {
    time = time + "月上";
  }

  let total_star = 0;
  let star = [];
  for (let val of res.floors) {
    if (val.index < 9) {
      continue;
    }
    total_star += val.star;
    star.push(val.star);
  }
  total_star = total_star + "（" + star.join("-") + "）";

  let dataName = ["damage", "take_damage", "defeat", "normal_skill", "energy_skill"];
  let data = [];

  for (let val of dataName) {
    if (!res[`${val}_rank`] || res[`${val}_rank`].length <= 0) {
      res[`${val}_rank`] = [
        {
          value: 0,
          avatar_id: 10000007,
        },
      ];
    }
    data[val] = {
      num: res[`${val}_rank`][0].value,
      name: roleIdToName(res[`${val}_rank`][0].avatar_id, true),
    };

    if (data[val].num > 1000) {
      data[val].num = (data[val].num / 10000).toFixed(1);
      data[val].num += " w";
    }
  }

  for (let i in res.reveal_rank) {
    res.reveal_rank[i].name = roleIdToName(res.reveal_rank[i].avatar_id, true);
  }

  let base64 = await render("genshin", "abyss", {
    save_id: uid,
    uid,
    time,
    max_floor: res.max_floor,
    total_star,
    list: res.reveal_rank,
    total_battle_times: res.total_battle_times,
    ...data,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

//#深渊十二层
export async function abyssFloor(e) {

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;


  //调角色数据接口刷新深渊数据
  let role = await MysApi.getIndex();
  if (!role) return true;


  let roleArr = lodash.keyBy(role.avatars, "id");

  let schedule_type = 1;
  if (e.msg.includes("上期")) {
    schedule_type = 2;
  }

  let res = await MysApi.getSpiralAbyss(schedule_type);
  if (!res) return true;
  res = res.floors;

  let floor = lodash.keyBy(res, "index");

  //从消息中获取
  let reg = /^#*[上期]*(深渊|深境|深境螺旋)[上期]*[第]*(9|10|11|12|九|十|十一|十二)层[ |0-9]*$/;
  let floorIndex = e.msg.match(reg);

  if (!floorIndex) {
    return true;
  }
  floorIndex = floorIndex[2];

  switch (floorIndex) {
    case "9":
    case "九":
      floor = floor["9"];
      floorIndex = 9;
      break;
    case "10":
    case "十":
      floor = floor["10"];
      floorIndex = 10;
      break;
    case "11":
    case "十一":
      floor = floor["11"];
      floorIndex = 11;
      break;
    case "12":
    case "十二":
      floor = floor["12"];
      floorIndex = 12;
      break;
    default:
      floor = "";
      break;
  }

  if (!floor) {
    e.reply(`暂无第${floorIndex}层数据`);
    return true;
  }

  let list = [];
  for (let val of floor.levels) {
    if (!val.battles || val.battles.length < 2) {
      continue;
    }
    val.time = format("yyyy-MM-dd hh:mm:ss", new Date(val.battles[0].timestamp * 1000));

    for (let i in val.battles) {
      for (let j in val.battles[i].avatars) {
        val.battles[i].avatars[j].name = roleArr[val.battles[i].avatars[j].id].name;

        if (val.battles[i].avatars[j].id == 10000005) {
          val.battles[i].avatars[j].name = "空";
        }
        if (val.battles[i].avatars[j].id == 10000007) {
          val.battles[i].avatars[j].name = "荧";
        }

        val.battles[i].avatars[j].life = roleArr[val.battles[i].avatars[j].id].actived_constellation_num;
      }
    }
    list.push(val);
  }

  let base64 = await render("genshin", "abyssFloor", {
    save_id: uid,
    uid: uid,
    floorIndex,
    floor,
    list,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true;
}

//#命座
export async function life(e) {
  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let res = await MysApi.getCharacter();
  if (!res) return true;

  let avatars = res.avatars;

  if (avatars.length <= 0) {
    return true;
  }

  let type; //五星
  if (avatars.length > 8) {
    type = 5;
    if (/(.*)(四星|4星)(.*)/.test(e.msg)) {
      type = 4; //四星
    }
  }

  let list = [];

  for (let val of avatars) {
    let rarity = val.rarity;
    if (val.rarity > 5) {
      rarity = 5;
    }

    if (type && rarity != type) {
      continue;
    }

    val.sort = rarity * 100000 + val.actived_constellation_num * 10000 + val.level * 100 + (val.id - 10000000);

    //增加神里排序
    if (val.id == 10000002) {
      val.sort += 50;
    }

    if (val.rarity > 5) {
      val.sort = val.sort - (val.id - 10000000);
    }
    val.sortLevel = val.level;

    val.weapon.showName = genshin.abbr[val.weapon.name] ? genshin.abbr[val.weapon.name] : val.weapon.name;

    if (val.id == 10000005) {
      val.name = "空";
      val.sort = 0;
    }
    if (val.id == 10000007) {
      val.name = "荧";
      val.sort = 0;
    }

    val.costumesLogo = "";
    if (val.costumes && val.costumes.length >= 1) {
      for (let v of val.costumes) {
        if (genshin.costumes.includes(v.name)) {
          val.costumesLogo = 2;
          break;
        }
      }
    }

    list.push(val);
  }

  list = lodash.chain(list).orderBy(["sortLevel"], ["desc"]).orderBy(["sort"], ["desc"]).value();

  let num = list.length;

  let base64 = await render("genshin", "life", {
    save_id: uid,
    uid: uid,
    num: num,
    list,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

//#今日素材
export async function todayQuery(e) {
  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let res = await MysApi.getCharacter();
  if (!res) return true;

  let avatars = res.avatars;

  if (avatars.length <= 8) {
    // return true;
  }

  //除周日日期余三
  let week = new Date().getDay() || 7;

  //4点后再展示第二日
  if (new Date().getHours() < 4) {
    week--;
  }

  if (week == 0 || week == 7) {
    e.reply("今日全部素材都可以刷哦");
    return true;
  }

  //今天素材
  let nowElement = daily[week % 3];

  let mainList = [];
  let count = 0;

  for (let i in nowElement) {
    lodash.forEach(nowElement[i], (ele, name) => {
      let temp = {
        name: name,
        area: ele[0],
        //区分武器和天赋类型
        isTalent: i == 0 ? true : false,
        list: []
      }

      //获取角色数组
      let element = ele[1];

      for (let val of avatars) {
        //进行天赋的数据处理
        if ((temp.isTalent) && (element.indexOf(val.name) != -1)) {
          let rarity = val.rarity;
          if (val.rarity > 5) {
            rarity = 5;
          }

          val.sort = rarity * 100000 + val.actived_constellation_num * 10000 + val.level * 100 + (val.id - 10000000);

          //增加神里排序
          if (val.id == 10000002) {
            val.sort += 50;
          }

          if (val.rarity > 5) {
            val.sort = val.sort - (val.id - 10000000);
          }
          val.sortLevel = val.level;

          if (val.id == 10000005) {
            val.name = "空";
            val.sort = 0;
          }
          if (val.id == 10000007) {
            val.name = "荧";
            val.sort = 0;
          }

          temp.list.push(val);
        }
        //进行武器的数据处理
        else if ((!temp.isTalent) && (element.indexOf(val.weapon.name) != -1)) {
          let firstSort = 0;
          firstSort += val.weapon.level;
          firstSort += (val.weapon.rarity - 4) * 20;
          if (val.weapon.level >= 20) {
            firstSort += val.level;
          }
          if (!genshin.actWeapon.includes(val.weapon.name)) {
            firstSort += val.weapon.affix_level * 5;
          }

          if (val.id == 10000005) {
            val.name = "空";
          }
          if (val.id == 10000007) {
            val.name = "荧";
          }

          let sort = 0;
          sort += val.weapon.rarity * 1000000;
          sort += val.weapon.affix_level * 100000;
          sort += val.weapon.level * 1000;
          sort += val.rarity * 100;
          sort += val.level;

          temp.list.push({
            role_name: val.name,
            role_level: val.level,
            role_rarity: val.rarity,
            name: val.weapon.name,
            //showName: genshin.abbr[val.weapon.name] ? genshin.abbr[val.weapon.name] : val.weapon.name,
            rarity: val.weapon.rarity,
            level: val.weapon.level,
            affix_level: val.weapon.affix_level,
            firstSort,
            sort,
          });
        }
      }

      //重新排序
      if (temp.isTalent == 1) {
        temp.list = lodash.chain(temp.list).orderBy(["sortLevel"], ["desc"]).orderBy(["sort"], ["desc"]).value();
      } else {
        temp.list = lodash.chain(temp.list).orderBy(["firstSort"], ["desc"]).orderBy(["sort"], ["desc"]).value();
      }

      count++;
      mainList.push(temp);
    })
  }

  let day = format("MM-dd hh:mm", new Date());
  let weekData = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  day += " " + weekData[new Date().getDay()];

  //let num = mainList.length;
  let num = count;

  let base64 = await render("genshin", "today", {
    save_id: uid,
    uid: uid,
    day: day,
    num: num,
    mainList,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

let skillLoading = {};

//技能列表，配置了cookie能查
export async function talentList(e) {
  //缓存时间，单位小时
  let cacheCd = 6;

  let msg = e.msg.replace("#", "").trim();
  if (msg === "角色统计" || msg === "武器统计") {
    //暂时避让一下抽卡分析的关键词
    return false;
  }

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  //禁止重复获取
  if (skillLoading[e.user_id]) {
    e.reply("角色数据获取中，请耐心等待...");
    setTimeout(() => {
      if (skillLoading[e.user_id]) delete skillLoading[e.user_id];
    }, 60000);
    return;
  }

  const displayMode = /(角色|武器|练度)/.test(e.msg) ? "weapon" : "talent";

  //四星五星
  let star = 0;
  if (/(四|4)/.test(msg)) star = 4;
  if (/(五|5)/.test(msg)) star = 5;

  // 技能查询缓存
  let cachePath = `./data/cache/`;
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath);
  }
  cachePath += "talentList/";
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath);
  }

  let avatarRet = [];

  let hasCache = await redis.get(`cache:uid-talent-new:${uid}`); // 由于数据结构改变，临时修改一下键值，防止命中历史缓存导致展示错误
  if (hasCache && !/force/.test(e.msg)) {
    // 有缓存优先使用缓存
    let jsonRet = fs.readFileSync(cachePath + `${uid}.json`, "utf8");
    avatarRet = JSON.parse(jsonRet);
  } else {

    skillLoading[e.user_id] = true;
    let resIndex = await MysApi.getCharacter();
    if (!resIndex) {
      delete skillLoading[e.user_id];
      return true;
    }

    let avatarData = resIndex && resIndex.avatars || [];

    // let skillRet = [], skill = [];
    //配置了cookie的才去获取技能
    // if (NoteCookie[e.user_id]) {

    let skillRet = [], skill = [];
    //配置了完整cookie的才去获取技能

    if (e.isSelfCookie) {
      e.reply("角色数据获取中，请耐心等待...");
      //批量获取技能数据，分组10个id一次，延迟100ms
      let num = 10, ms = 100;
      let avatarArr = lodash.chunk(avatarData, num);
      for (let val of avatarArr) {
        for (let avatar of val) {
          skillRet.push(getSkill(e, uid, avatar, MysApi));
        }
        skillRet = await Promise.all(skillRet);
        //过滤没有获取成功的
        skillRet.filter(item => item.a);
        skillRet = skillRet.filter(item => item.a);

        await common.sleep(ms);
      }
      skill = lodash.keyBy(skillRet, "id");
    }

    // 天赋等级背景
    const talentLvMap = '0,1,1,1,2,2,3,3,3,4,5'.split(',')

    // 根据每日素材构建 角色->素材的映射关系
    let charTalentMap = {};
    daily.forEach((weekCfg, week) => {
      lodash.forIn(weekCfg[0], (talentCfg, talentName) => {
        talentCfg[1].forEach((charName) => {
          charTalentMap[charName] = { name: talentName, week: [3, 1, 2][week] };
        })
      })
    });

    for (let idx in avatarData) {
      let curr = avatarData[idx];
      let avatar = lodash.pick(curr, "id,name,rarity,level,rarity,fetter".split(","));
      // 埃洛伊rarity是105...
      avatar.rarity = avatar.rarity > 5 ? 5 : avatar.rarity;
      let weapon = curr.weapon || {};
      "name,level,rarity,affix_level".split(",").forEach((idx) => {
        avatar[`weapon_${idx}`] = curr.weapon[idx];
      });
      avatar.cons = curr.actived_constellation_num;
      if (avatar.id == 10000007) {
        avatar.name = "荧";
      } else if (avatar.id == 10000005) {
        avatar.name = "空";
      } else {
        let talent = charTalentMap[avatar.name] || {};
        avatar.talent = talent.name;
        avatar.talentWeek = talent.week; //`${talent.week}${talent.week + 3}`;
      }

      let skillRet = skill[avatar.id] || {};
      const talentConsCfg = { a: 0, e: 3, q: 5 };

      lodash.forIn(talentConsCfg, (consLevel, key) => {
        let talent = skillRet[key] || {};
        // 天赋等级
        avatar[key] = talent.level_current || '-';
        // 是否有命座加成
        avatar[`${key}_plus`] = talent.level_current > talent.level_original;
        // 天赋书星级
        avatar[`${key}_lvl`] = talentLvMap[talent.level_original * 1];
        avatar[`${key}_original`] = talent.level_original * 1;
      })
      avatar.aeq = avatar.a * 1 + avatar.e + avatar.q;
      avatarRet.push(avatar);
    }

    fs.writeFileSync(cachePath + `${uid}.json`, JSON.stringify(avatarRet));
    //缓存
    await redis.set(`cache:uid-talent-new:${uid}`, uid, { EX: 3600 * cacheCd });
    delete skillLoading[e.user_id];
    // }

  }
  //超过八个角色才分类四星五星
  if (star >= 4 && avatarRet.length > 8) {
    avatarRet = avatarRet.filter(item => item.rarity == star);
  }

  let sortKey = ({
    talent: "aeq,rarity,level,star,fetter,talentWeek",
    weapon: "level,rarity,aeq,cons,weapon_level,weapon_rarity,weapon_affix_level,fetter"
  })[displayMode].split(",");

  avatarRet = lodash.orderBy(avatarRet, sortKey, lodash.repeat("desc,", sortKey.length).split(","));

  let noTalent = avatarRet.length == 0 || /^\-+$/.test(avatarRet.map((d) => d.a).join(""));

  let talentNotice = `技能列表每${cacheCd}小时更新一次`;
  if (noTalent) {
    talentNotice = "未绑定体力Cookie，无法获取天赋列表。请回复 #体力 获取配置教程";
  }

  let week = new Date().getDay();
  if (new Date().getHours() < 4) {
    week--;
  }

  if (e.noReplyTalentList) {
    return true;
  }

  let base64 = await render("genshin", "talentList", {
    save_id: uid,
    uid: uid,
    avatars: avatarRet,
    bgType: Math.ceil(Math.random() * 3),
    abbr: genshin.abbr,
    displayMode,
    isSelf: e.isSelf,
    week: [3, 1, 2][week % 3],
    talentNotice

  });

  if (base64) {
    let msg = [];
    if (e.isGroup) {
      let name = lodash.truncate(e.sender.card, { length: 8 });
      msg.push(segment.at(e.user_id, name));
    }
    msg.push(segment.image(`base64://${base64}`));
    e.reply(msg);
  }
  return true; //事件结束不再往下
}

//#武器
export async function weapon(e) {

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;


  let res = await MysApi.getCharacter();
  if (!res) return true;

  let avatars = res.avatars;

  if (avatars.length <= 0) {
    return true;
  }

  let weapon = [];
  for (let val of avatars) {
    if (val.weapon.rarity <= 1) {
      continue;
    }
    if (val.id == 10000005) {
      val.name = "空";
    }
    if (val.id == 10000007) {
      val.name = "荧";
    }
    if (val.rarity > 5) {
      val.rarity = 5;
    }

    let firstSort = 0;
    firstSort += val.weapon.level;
    firstSort += (val.weapon.rarity - 4) * 20;
    if (val.weapon.level >= 20) {
      firstSort += val.level;
    }
    if (!genshin.actWeapon.includes(val.weapon.name)) {
      firstSort += val.weapon.affix_level * 5;
    }

    let sort = 0;
    sort += val.weapon.rarity * 1000000;
    sort += val.weapon.affix_level * 100000;
    sort += val.weapon.level * 1000;
    sort += val.rarity * 100;
    sort += val.level;

    weapon.push({
      role_name: val.name,
      role_level: val.level,
      role_rarity: val.rarity,
      name: val.weapon.name,
      showName: genshin.abbr[val.weapon.name] ? genshin.abbr[val.weapon.name] : val.weapon.name,
      rarity: val.weapon.rarity,
      level: val.weapon.level,
      affix_level: val.weapon.affix_level,
      firstSort,
      sort,
    });
  }

  //重新排序
  weapon = lodash.chain(weapon).orderBy(["firstSort"], ["desc"]).orderBy(["sort"], ["desc"]).value();

  let base64 = await render("genshin", "weapon", {
    save_id: uid,
    uid: uid,
    list: weapon,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

//#神里
export async function character(e) {
  let msg = e.msg || "";

  if (e.atBot) {
    msg = "#" + msg.replace("#", "");
  }

  if (!/^#(.*)$/.test(msg)) return;

  let roleId = roleIdToName(msg.replace(/#|老婆|老公|[1|2|5][0-9]{8}/g, "").trim());

  if (!roleId) return false;

  Bot.logger.mark(`[${e.group_name}] ${e.msg}:character`);

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let res = await MysApi.getCharacter();
  if (!res) return true;

  let avatars = res.avatars;
  let length = avatars.length;

  avatars = lodash.keyBy(avatars, "id");

  if (roleId == 20000000) {
    if (avatars["10000005"]) {
      roleId = "10000005";
    }
    if (avatars["10000007"]) {
      roleId = "10000007";
    }
  }

  if (!avatars[roleId]) {
    let name = lodash.truncate(e.sender.card, { length: 8 });
    if (length > 8) {
      let rand_face = lodash.sample([26, 111, 110, 173, 177, 36, 37, 5, 9, 267, 264, 262, 265]);
      e.reply([segment.at(e.user_id, name), `\n没有${e.msg}`, segment.face(rand_face)]);
    } else {
      e.reply([segment.at(e.user_id, name), "\n请先在米游社展示该角色"]);
    }
    return true;
  }

  avatars = avatars[roleId];

  let skill = await getSkill(e, uid, avatars, MysApi);

  let type = "character";

  let base64 = await render("genshin", type, {
    save_id: uid,
    uid: uid,
    element: element[avatars.name],
    skill,
    ...get_character(avatars),
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //事件结束不再往下
}

//#老婆
export async function wife(e) {

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let isCard = false;
  if (e.msg.includes("2")) {
    isCard = true;
  }

  e.msg = e.msg.replace(/#|\w/g, "");

  let i = 0;
  if (["老婆", "媳妇", "妻子", "娘子", "女朋友", "女友", "女神"].includes(e.msg)) {
    i = 0;
  } else if (["老公", "丈夫", "夫君", "郎君", "男朋友", "男友", "男神"].includes(e.msg)) {
    i = 1;
  } else if (["女儿"].includes(e.msg)) {
    i = 2;
  } else if (["儿子"].includes(e.msg)) {
    e.reply("暂无正太角色");
    return true;
  } else {
    return true;
  }


  let res = await MysApi.getCharacter();

  let avatars = res?.avatars || [];

  if (avatars.length <= 0) {
    return true;
  }

  let list = [];

  for (let val of avatars) {
    if (!genshin.wifeData[i].includes(Number(val.id))) {
      continue;
    }
    if (val.rarity > 5) {
      val.rarity = 5;
    }

    //等级+好感*10+命座*5+五星*20
    val.sort = val.level + val.fetter * 10 + val.actived_constellation_num * 5 * (val.rarity - 3) + (val.rarity - 4) * 20;

    //超过80级的每级*5
    if (val.level > 80) {
      val.sort += (val.level - 80) * 5;
    }

    //武器 等级+五星*25+精炼*5
    val.sort += val.weapon.level + (val.weapon.rarity - 4) * 25 + val.weapon.affix_level * 5;

    //武器超过80级的每级*5
    if (val.weapon.level > 80) {
      val.sort += (val.weapon.level - 80) * 5;
    }

    //圣遗物等级
    for (let rel of val.reliquaries) {
      val.sort += rel.level * 1.2;
    }

    list.push(val);
  }

  if (list.length <= 0) {
    return true;
  }

  list = lodash.orderBy(list, ["sort"], ["desc"]);

  if (lodash.random(0, 100) <= 30 || isCard) {
    e.msg = `${list[0].name}卡片`;
    e.avatars = list;
    return false;
  }

  let skill = await getSkill(e, uid, list[0], MysApi);

  let base64 = await render("genshin", "character", {
    save_id: uid,
    uid: uid,
    skill,
    element: element[list[0].name],
    ...get_character(list[0]),
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true;
}

//获取角色技能数据
async function getSkill(e, uid, avatars, MysApi) {

  let skill = {};
  if (e.isSelfCookie) {
    let skillres = await MysApi.getDetail(avatars.id);
    if (skillres && skillres.skill_list) {
      skill.id = avatars.id;
      let skill_list = lodash.orderBy(skillres.skill_list, ["id"], ["asc"]);
      for (let val of skill_list) {
        val.level_original = val.level_current;
        if (val.name.includes("普通攻击")) {
          skill.a = val;
          continue;
        }
        if (val.max_level >= 10 && !skill.e) {
          skill.e = val;
          continue;
        }
        if (val.max_level >= 10 && !skill.q) {
          skill.q = val;
          continue;
        }
      }
      if (avatars.actived_constellation_num >= 3) {
        if (avatars.constellations[2].effect.includes(skill.e.name)) {
          skill.e.level_current += 3;
        } else if (avatars.constellations[2].effect.includes(skill.q.name)) {
          skill.q.level_current += 3;
        }
      }
      if (avatars.actived_constellation_num >= 5) {
        if (avatars.constellations[4].effect.includes(skill.e.name)) {
          skill.e.level_current += 3;
        } else if (avatars.constellations[4].effect.includes(skill.q.name)) {
          skill.q.level_current += 3;
        }
      }
    }
  }

  return skill;
}

//#神里2，#神里卡片
export async function character2(e) {
  let roleName, id;
  if (!e.isPoke) {
    roleName = e.msg.replace(/#|\w|卡片/g, "").trim();
    id = roleIdToName(roleName);
    roleName = roleIdToName(id, true);
    if (!id) return false;
  }

  let MysApi = await getMysApi(e);
  if (!MysApi) return true;
  let uid = MysApi.targetUid;

  let avatars;

  if (!e.avatars) {
    let res = await MysApi.getCharacter();
    if (!res) return true;
    avatars = res.avatars;
  } else {
    avatars = e.avatars;
  }

  let avaLength = avatars.length;
  avatars = lodash.keyBy(avatars, "id");

  if (e.isPoke) {
    avatars = lodash.sample(avatars);
    Bot.logger.mark(`[${e.group.name}] 戳一戳:${avatars.name}`);
  } else if (!avatars[id]) {
    let name = lodash.truncate(e.sender.card, { length: 8 });
    if (avaLength > 8) {
      let rand_face = lodash.sample([26, 111, 110, 173, 177, 36, 37, 5, 9, 267, 264, 262, 265]);
      e.reply([segment.at(e.user_id, name), `\n没有${roleName}`, segment.face(rand_face)]);
    } else {
      e.reply([segment.at(e.user_id, name), "\n请先在米游社展示该角色"]);
    }
    return true;
  } else {
    avatars = avatars[id];
  }

  if (avatars.id == "10000005") {
    avatars.name = "空";
  } else if (avatars.id == "10000007") {
    avatars.name = "荧";
  }

  //随机获取背景图
  let path = `./resources/genshin/logo/bg2/${avatars.name}/`;
  if (!fs.existsSync(path)) {
    if (!e.isPoke) {
      e.reply(`暂无${roleName}素材`);
    }
    return true;
  }
  let randBg = fs.readdirSync(path);
  if (randBg.length <= 0) {
    if (!e.isPoke) {
      e.reply(`暂无${roleName}素材`);
    }
    return true;
  }

  let logKey = `genshin:randBg:${e.group_id}:${avatars.id}`;
  let old = await redis.get(logKey);
  if (old) {
    old = JSON.parse(old);
    let tmp = lodash.difference(randBg, old);
    if (tmp.length > 0) {
      randBg = tmp;
    } else {
      old = [];
    }
  } else {
    old = [];
  }

  randBg = lodash.sample(randBg);
  old.push(randBg);
  redis.set(logKey, JSON.stringify(old), { EX: 3600 * 4 });

  let base64 = await render(
    "genshin",
    "character2",
    {
      save_id: uid,
      uid: uid,
      element: element[avatars.name],
      randBg,
      ...get_character(avatars),
    }
  );

  if (base64) {
    if (e.isPoke) {
      e.group.sendMsg([segment.at(e.user_id), segment.image(`base64://${base64}`)]);
    } else {
      e.reply(segment.image(`base64://${base64}`));
    }
  }

  return true; //事件结束不再往下
}

//戳一戳返回角色卡片
export async function pokeCharacter(e) {
  let check = await redis.get(`genshin:uid:${e.operator_id}`);
  if (!check) {
    return;
  }

  let key = `genshin:poke:${e.user_id}`;

  let num = await redis.get(key);
  if (num && num > 2 && !e.isMaster) {
    if (!(await redis.get(`genshin:pokeTips:${e.group_id}`))) {
      e.reply([segment.at(e.user_id), "\n戳太快了，请慢点。。"]);
      redis.set(`genshin:pokeTips:${e.group_id}`, "1", { EX: 120 });
      return;
    }

    await redis.incr(key);
    redis.expire(key, 120);

    return;
  } else {
    await redis.incr(key);
    redis.expire(key, 120);
  }

  character2(e);

  return;
}

function get_character(avatars) {
  let list = [];
  let set = {};
  let setArr = [];
  let text1 = "";
  let text2 = "";
  let bg = 2;

  list[0] = {
    type: "weapon",
    name: avatars.weapon.name,
    showName: genshin.abbr[avatars.weapon.name] ? genshin.abbr[avatars.weapon.name] : avatars.weapon.name,
    level: avatars.weapon.level,
    affix_level: avatars.weapon.affix_level,
  };

  for (let val of avatars.reliquaries) {
    if (set[val.set.name]) {
      set[val.set.name]++;

      if (set[val.set.name] == 2) {
        if (text1) {
          text2 = "2件套：" + val.set.affixes[0].effect;
        } else {
          text1 = "2件套：" + val.set.affixes[0].effect;
        }
      }

      if (set[val.set.name] == 4) {
        text2 = "4件套：" + val.set.name;
      }
    } else {
      set[val.set.name] = 1;
    }

    list.push({
      type: "reliquaries",
      name: val.name,
      level: val.level,
    });
  }

  for (let val of Object.keys(set)) {
    setArr.push({
      name: val,
      num: set[val],
      showName: genshin.abbr[val] ? genshin.abbr[val] : val,
    });
  }

  if (avatars.reliquaries.length >= 2 && !text1) {
    text1 = "无套装效果";
  }

  if (avatars.id == "10000005") {
    avatars.name = "空";
  } else if (avatars.id == "10000007") {
    avatars.name = "荧";
  }

  //皮肤图片
  if (["魈", "甘雨"].includes(avatars.name)) {
    if (lodash.random(0, 100) > 50) {
      bg = 3;
    }
  } else if (["芭芭拉", "凝光", "刻晴", "琴"].includes(avatars.name)) {
    if (avatars.costumes && avatars.costumes.length >= 1) {
      bg = 3;
    }
  }

  return {
    name: avatars.name,
    showName: genshin.abbr[avatars.name] ? genshin.abbr[avatars.name] : avatars.name,
    level: avatars.level,
    fetter: avatars.fetter,
    actived_constellation_num: avatars.actived_constellation_num,
    list,
    text1,
    text2,
    bg,
    set: setArr,
  };
}

/**
 * @param {角色昵称} keyword
 * @param {是否搜索角色默认名} search_val
 * @returns
 */
export function roleIdToName(keyword, search_val = false) {
  if (!keyword) {
    return false;
  }
  if (search_val) {
    if (genshin.roleId[keyword] && genshin.roleId[keyword][0]) {
      return genshin.roleId[keyword][0];
    } else {
      return "";
    }
  }

  if (!nameID) {
    nameID = new Map();
    for (let i in genshin.roleId) {
      for (let val of genshin.roleId[i]) {
        nameID.set(val, i);
      }
    }
  }
  let name = nameID.get(keyword);
  return name ? name : "";
}


function dayCount(num) {
  let year = Math.floor(num / 356);
  let month = Math.floor((num % 356) / 30);
  let day = (num % 356) % 30;
  let msg = "";
  if (year > 0) {
    msg += year + "年";
  }
  if (month > 0) {
    msg += month + "个月";
  }
  if (day > 0) {
    msg += day + "天";
  }
  return msg;
}

//检查配置cookie是否过期
export async function checkCookie(e) {
  if (BotConfig.mysCookies.length <= 0) {
    return;
  }

  if (!e.isMaster) {
    e.reply("暂无权限");
    return true;
  }
  if (BotConfig.mysCookies.length == 1 && !BotConfig.mysCookies[0]) {
    e.reply("尚未配置公共查询cookie");
    return true;
  }

  e.reply(`检查公共配置cookie中...`);

  let hasErr;

  for (let i in BotConfig.mysCookies) {
    let cookie = BotConfig.mysCookies[i];

    if (!cookie.includes("ltoken")) {
      Bot.logger.error(`公共配置cookie错误:第${i + 1}个`);
      continue;
    }

    let ltuid = cookie.match(/ltuid=(\w{0,9})/g)[0].replace(/ltuid=|;/g, "");

    let { url, headers } = getUrl("getGameRecordCard", ltuid);

    headers.Cookie = cookie;

    let response = await fetch(url, { method: "get", headers });

    if (!response.ok) {
      Bot.logger.error(response);
      continue;
    }
    const res = await response.json();

    if (res.retcode == 10001) {
      hasErr = true;
      let msg = `公共配置cookie已失效:第${Number(i) + 1}个，ltuid:${ltuid}`;
      Bot.logger.error(msg);
      e.reply(msg);

      // 删除MysUser缓存中对应记录
      await MysUser.delBotCookie(cookie);
      continue;
    }
    if (res.retcode != 0) {
      hasErr = true;
      let msg = `公共配置cookie报错:第${Number(i) + 1}个，ltuid:${ltuid}`;
      Bot.logger.error(msg);
      e.reply(msg);

      // 删除MysUser缓存中对应记录
      await MysUser.delBotCookie(cookie);

      continue;
    }
  }
  if (!hasErr) {
    e.reply(`检查公共配置cookie完成\n${BotConfig.mysCookies.length}个全部正常`);
  }

  return true;
}

//配置cookie
export async function setCookie(e) {
  let msg = e.msg.replace(/#|配置/g, "").trim();
  if (msg == "") {
    return false;
  }
  if (!e.isMaster) {
    // e.reply("暂无权限");
    return false;
  }
  if (msg == "cookie") {
    e.reply("请私聊发送【配置cookie】进行设置\n例如：配置'ltoken=***;ltuid=***;'");
    return true;
  }

  if (e.isGroup) {
    return true;
  }

  if (!msg.includes("ltoken") || !msg.includes("ltuid") || msg.includes("ltoken=**")) {
    e.reply("配置公共查询cookie错误，请输入【配置cookie】");
    return true;
  }

  let ltoken = msg.match(/ltoken([^;]+;){1}/)[0];
  let ltuid = msg.match(/ltuid=(\w{0,9})/g)[0];

  //判断是否已经配置
  for (let val of BotConfig.mysCookies) {
    if (val.includes(ltuid) || val.includes(ltoken)) {
      e.reply("该cookie已配置，请勿重复发送");
      return true;
    }
  }

  let { url, headers } = getUrl("getGameRecordCard", ltuid.replace(/ltuid=|;/g, ""));

  headers.Cookie = ltoken + ltuid + ";";

  let response = await fetch(url, { method: "get", headers });

  if (!response.ok) {
    Bot.logger.error(response);
    e.reply("米游社接口报错");
    return true;
  }
  const res = await response.json();

  if (res.retcode == 10001) {
    e.reply("配置cookie已失效");
    return true;
  }
  if (res.retcode != 0) {
    e.reply("配置cookie错误");
    return true;
  }

  BotConfig.mysCookies = lodash.compact(BotConfig.mysCookies);
  BotConfig.mysCookies.push(headers.Cookie);

  let ckStr = BotConfig.mysCookies.join("',\n'");
  let configPath = "./config/config.js";

  let str = fs.readFileSync(configPath, "utf8");
  str = str.replace(/mysCookies:([^\]]*)/, `mysCookies:[\n'${ckStr}',\n`);
  fs.writeFileSync(configPath, str);

  // 将用户注册至MysUser缓存
  await MysUser.addBotCookie(headers.Cookie);

  e.reply(`配置公共查询cookie成功，已配置${BotConfig.mysCookies.length}个cookie\n【#检查ck】查看配置cookie是否失效`);
  return true;
}
