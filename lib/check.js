import fs from "fs";
import readline from "readline";
import lodash from "lodash";

if (!fs.existsSync("./node_modules")) {
  console.log("请先npm install安装，或者cnpm install安装");
  process.exit();
}

let configPath = "./config/config.js";
let rl;

function question(query) {
  return new Promise((resolve) => {
    if (!rl) return;
    rl.question(query.trim(), resolve);
  });
}

//检查配置文件config.js
async function check() {
  if (fs.existsSync(configPath)) {
    global.BotConfig = (await import(`../config/config.js`)).config;

    //默认配置
    if (!global.BotConfig.account.log_level) {
      global.BotConfig.account.log_level = "info";
    }
    if (!global.BotConfig.account.platform) {
      global.BotConfig.account.platform = "5";
    }
    if (!global.BotConfig.pushTask) {
      global.BotConfig.pushTask = {
        signTime: "0 2 0 * * ?",
        isPushSign: 0,
      };
    }
    if (lodash.isUndefined(global.BotConfig.account.autoQuit)) {
      global.BotConfig.account.autoQuit = "1";
    }
    if (!global.BotConfig.cookieDoc) {
      global.BotConfig.cookieDoc = "docs.qq.com/doc/DUWNVQVFTU3liTVlO";
    }
    if (lodash.isUndefined(global.BotConfig.pushTask.isPushLedger)) {
      global.BotConfig.pushTask.isPushLedger = 1;
    }
	if (lodash.isUndefined(global.BotConfig.pushTask.isPushNote)) {
	  global.BotConfig.pushTask.isPushNote = 1;
	}
	if (lodash.isUndefined(global.BotConfig.pushTask.isPushNews)) {
	  global.BotConfig.pushTask.isPushNews = 1;
	}
	if (lodash.isUndefined(global.BotConfig.disablePrivate)) {
	  global.BotConfig.disablePrivate = false;
	}
	
  } else {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let qq, pwd, platform, cookie, gachaDayNum, masterQQ;
    console.log("请按提示输入，生成配置文件config.js，输入错误【Ctrl+c】结束重来");
    qq = await question("请输入机器人QQ号(请用小号)：\n");
    if (!qq) {
      return await check();
    }
    pwd = await question("请输入密码(为空则扫码登录)：\n");
    platform = (await question("1-安卓手机 2-aPad  3-安卓手表 4-MacOS  5-iPad\n请选择登录设备【1-5】：")) || 1;

    if (platform && !/^\d+$/.test(platform)) {
      platform = 1;
    }

    cookie = await question("请输入米游社cookie（查原神角色数据用）：");
    cookie = cookie.replace(/'|"|,/g, "");
    if (!cookie.includes("ltoken") || !cookie.includes("ltuid")) {
      if (cookie) {
        console.log("米游社cookie输入错误");
      }
      cookie = "";
    }
    gachaDayNum = (await question("请输入每天抽卡次数【1-1000】，默认一次：")) || 1;

    if (gachaDayNum && !/^\d+$/.test(gachaDayNum)) {
      console.log("每天抽卡次数输入错误，已改为默认一次");
      gachaDayNum = 1;
    }

    masterQQ = await question("请输入主人QQ号：");

    let str = fs.readFileSync("./config/config_default.js", "utf8");
    str = str.replace(/qq:(.*)""/, `qq:"${qq}"`);
    str = str.replace(/pwd:(.*)""/, `pwd:"${pwd}"`);
    str = str.replace(/platform:(.*),/, `platform:"${platform}",`);
    str = str.replace(/gachaDayNum: 1,/, `gachaDayNum: ${gachaDayNum},`);
    str = str.replace(/masterQQ:\[123456,/, `masterQQ: [${masterQQ},`);
    str = str.replace(/mysCookies:([^\]]*)/, `mysCookies:['${cookie}',`);

    fs.writeFileSync(configPath, str);
    console.log("生成配置文件成功\n其他配置请打开config/config.js修改");
    global.BotConfig = (await import(`../config/config.js`)).config;
    BotConfig.first = true;
  }
}

export { check };
