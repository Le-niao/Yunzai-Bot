import { segment } from "oicq";
import { render } from "../render.js";
import lodash from "lodash";
import { roleId5,roleId4 } from "../../config/genshin/roleId.js";

//项目路径
const _path = process.cwd();

let checkMsg = "设置角色、武器、技能等级有误\n指令：#绫华养成\n示例：#绫华养成81 90 9 9 9\n参数为角色、武器、技能等级";

export const rule = {
  skillcalculateHelp: {
    reg: "^#*角色(养成|计算|养成计算)$", //匹配消息正则，命令正则
    priority: 800, //优先级，越小优先度越高
    describe: "【#养成计算器】根据已有角色计算养成所需材料", //【命令】功能说明
  },
  skillcalculate: {
    reg: "^#*(.*)(养成|计算|培养)([0-9]|,|，| )*$", //匹配消息正则，命令正则
    priority: 801, //优先级，越小优先度越高
    describe: "【#养成计算器】根据已有角色计算养成所需材料", //【命令】功能说明
  },
};

export async function skillcalculateHelp(e) {
  let msg = `#角色养成计算\n指令：#绫华养成\n示例：#绫华养成81 90 9 9 9\n参数为角色、武器、技能等级`;
  e.reply(msg);
  return true;
}

export async function skillcalculate(e) {
  let defSetSkill = "90,90,10,10,10".split(",");

  let AvatarName = e.msg.replace(/#|＃|养成|计算|培养|[0-9]|,|，| /g, "").trim();
  let id = YunzaiApps.mysInfo.roleIdToName(AvatarName);
  let name = YunzaiApps.mysInfo.roleIdToName(id, true);

  if (!id) {
    return false;
  }
  if ([10000005, 10000007, 20000000].includes(Number(id))) {
    e.reply("暂不支持旅行者养成计算");
    return true;
  }

  let set = e.msg.replace(/#|＃|养成|计算/g, "").trim();

  set = set.replace(/，| /g, ",");

  set = set.replace(AvatarName, "");

  let setSkill = [];
  if (set) {
    setSkill = set.split(",");
    setSkill = lodash.compact(setSkill);
    for (let i = 0; i <= 4; i++) {
      if (!setSkill[i]) setSkill[i] = defSetSkill[i];
    }
  } else {
    setSkill = defSetSkill;
  }

  if (setSkill.length != 5) {
    let reMsg = checkMsg.replace(/绫华/g, AvatarName);
    e.reply(reMsg);
    return true;
  }

  let check = "90,90,10,10,10".split(",");

  for (const key in check) {
    if (parseInt(check[key]) < parseInt(setSkill[key])) {
      setSkill[key] = check[key];
    }
  }

  let MysApi = await e.getMysApi({
    auth: "cookie",
    targetType: "self",
    cookieType: "self",
    actionName: "查询养成计算",
  });
  if (!MysApi) {
    return true;
  }

  //角色
  let dataCharacter = await MysApi.getCharacter();

  if (!dataCharacter) {
    return true;
  }

  dataCharacter = dataCharacter.avatars.find((item) => item.id == id);

  //技能
  let skill_list = [];
  if (dataCharacter) {
    let data = await MysApi.getAvatar(id);
    if (!data) return true;

    skill_list = data.skill_list;
  } else {
    skill_list = await getSkillId(MysApi, id);

    if (!skill_list) {
      e.reply('暂无角色数据,请稍后再试');
      return true;
    }

    dataCharacter = {
      level: 1,
      name: name,
      icon: `../../../../resources/genshin/logo/role/${name}.png`,
      rarity: roleId4.includes(id) ? 4 : 5,
    };
  }

  skill_list = skill_list.filter((item) => item.max_level != 1);

  let body = {
    avatar_id: parseInt(id),
    avatar_level_current: parseInt(dataCharacter.level),
    avatar_level_target: parseInt(setSkill[0]),
    skill_list: [
      {
        id: parseInt(skill_list[0].group_id),
        level_current: parseInt(skill_list[0].level_current),
        level_target: parseInt(setSkill[2]),
      },
      {
        id: parseInt(skill_list[1].group_id),
        level_current: parseInt(skill_list[1].level_current),
        level_target: parseInt(setSkill[3]),
      },
      {
        id: parseInt(skill_list[2].group_id),
        level_current: parseInt(skill_list[2].level_current),
        level_target: parseInt(setSkill[4]),
      },
    ],
  };

  if (dataCharacter.weapon) {
    if (parseInt(dataCharacter.weapon.rarity) < 3) {
      setSkill[1] = 70;
    }
    body.weapon = {
      id: parseInt(dataCharacter.weapon.id),
      level_current: parseInt(dataCharacter.weapon.level),
      level_target: parseInt(setSkill[1]),
    };
  }

  let computes = await MysApi.getCompute(body);

  if (!computes) {
    return true;
  }

  computes._res = {};

  let formart = (num) => {
    return num > 10000 ? (num / 10000).toFixed(1) + " w" : num;
  };

  for (let i in computes) {
    for (let j in computes[i]) {
      computes[i][j].num = formart(computes[i][j].num);

      if (computes[i][j].name.includes("「")) {
        computes[i][j].isTalent = true;
      }
    }
  }

  let uid = MysApi.targetUser._uid;

  let base64 = await render("skillcalculate", "skillcalculate", {
    uid,
    dataCharacter,
    setSkill,
    skill_list,
    computes,
  });

  if (base64) {
    e.reply(segment.image(`base64://${base64}`));
  }

  return true; //返回true 阻挡消息不再往下
}

async function getSkillId(MysApi, roleId) {
  let res = await await MysApi.getAvatarSkill(roleId);

  if (!res) {
    return false;
  }
  
  res.list.forEach((item) => {
    item.level_current = 1;
  });

  return res.list;
}
