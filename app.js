import { check } from "./lib/check.js";
import { init } from "./lib/init.js";
import { createClient } from "oicq";
import solve from "./lib/dealMsg.js";

process.title = 'Yunzai-Bot';

//检查配置文件
await check();

//创建oicq
const Bot = createClient(BotConfig.account.qq, {
  log_level: BotConfig.account.log_level,
  platform: BotConfig.account.platform,
  resend: false,
  data_dir: process.cwd() + "/data",
});
global.Bot = Bot;

//扫码登录 or 密码登录
Bot.on("system.login.qrcode", function (e) {
  this.logger.mark("扫码后按Enter回车完成登录");
  process.stdin.once("data", () => {
    this.login();
  });
}).login(BotConfig.account.pwd);

//提交滑动验证码
Bot.on("system.login.slider", function (e) {
  this.logger.mark("请输入获取的ticket，按回车完成【滑动验证】");
  process.stdin.once("data", (input) => {
    this.submitSlider(input);
  });
});

//设备锁
Bot.on("system.login.device", function (e) {
  this.logger.info("触发设备锁验证，请输入数字选择验证方式:")
  this.logger.info("1.发送短信验证码到密保手机")
  this.logger.info("2.网页扫码验证")
  process.stdin.once("data", (choice) => {
    if(choice===1){
      // this.logger.mark("触发短信验证")
      this.sendSmsCode()
      this.logger.mark("请输入短信验证码:")
      process.stdin.once("data", (str) => {
        this.submitSmsCode(str)
      });
    }else{
      // this.logger.mark("触发网页扫码验证")
      this.logger.mark("扫码完成后回车以登录")
      process.stdin.once("data", () => {
        this.login()
      });
    }
  });
});

//登录错误
Bot.on("system.login.error", function (e) {
  if (e.code == 1) this.logger.error("请打开config.js，修改输入正确的密码");
  process.exit();
});

//监听上线事件
Bot.on("system.online", async () => {
  await init();
});

//监听群聊消息事件
Bot.on("message.group", (event) => {
  event.isGroup = true;
  solve.dealMsg(event).catch((error) => {
    Bot.logger.error(error);
  });
});

//监听私聊消息事件
Bot.on("message.private", (event) => {
  event.isPrivate = true;
  solve.dealMsg(event).catch((error) => {
    Bot.logger.error(error);
  });
});

//监听好友事件
Bot.on("request.friend", (event) => {
  solve.dealFriend(event);
});

//监听群通知
Bot.on("notice.group", (event) => {
  event.isGroup = true;
  solve.dealGroupNotice(event).catch((error) => {
    Bot.logger.error(error);
  });
});

//监听群事件
Bot.on("request.group", (event) => {
  solve.dealGroupRequest(event);
});