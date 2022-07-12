#!/bin/sh
set -e

GreenBG="\\033[42;37m"
YellowBG="\\033[43;37m"
BlueBG="\\033[44;37m"
Font="\\033[0m"

Version="${BlueBG}[版本]${Font}"
Info="${GreenBG}[信息]${Font}"
Warn="${YellowBG}[提示]${Font}"

WORK_DIR="/app/Yunzai-Bot"
MIAO_PLUGIN_PATH="/app/Yunzai-Bot/plugins/miao-plugin"
XIAOYAO_CVS_PATH="/app/Yunzai-Bot/plugins/xiaoyao-cvs-plugin"

echo -e "\n ================ \n ${Info} ${GreenBG} 拉取 Yunzai-Bot 更新 ${Font} \n ================ \n"
if [[ -z $(git status -s) ]]; then
    echo -e " ${Warn} ${YellowBG} 当前工作区有修改，尝试暂存后更新。${Font}"
    git add .
    git stash
    git pull origin master --allow-unrelated-histories --rebase
    git stash pop
else
    git pull origin master --allow-unrelated-histories --rebase
fi

echo -e "\n ================ \n ${Version} ${BlueBG} Yunzai-Bot 版本信息 ${Font} \n ================ \n"
git log -1 --pretty=format:"%h - %an, %ar (%cd) : %s"

echo -e "\n ================ \n ${Info} ${GreenBG} 更新 Yunzai-Bot 运行依赖 ${Font} \n ================ \n"
npm install

if [ -d $MIAO_PLUGIN_PATH"/.git" ]; then
    echo -e "\n ================ \n ${Info} ${GreenBG} 拉取喵喵插件更新 ${Font} \n ================ \n"
    cd $MIAO_PLUGIN_PATH

    if [[ ! -z $(git status -s) ]]; then
        echo -e " ${Warn} ${YellowBG} 当前工作区有修改，尝试暂存后更新。${Font}"
        git add .
        git stash
        git pull origin master --allow-unrelated-histories --rebase
        git stash pop
    else
        git pull origin master --allow-unrelated-histories --rebase
    fi

    echo -e "\n ================ \n ${Version} ${BlueBG} 喵喵插件版本信息 ${Font} \n ================ \n"
    git log -1 --pretty=format:"%h - %an, %ar (%cd) : %s"
fi

if [ -d $XIAOYAO_CVS_PATH"/.git" ]; then
    echo -e "\n ================ \n ${Info} ${GreenBG} 拉取 xiaoyao-cvs 插件更新 ${Font} \n ================ \n"
    cd $XIAOYAO_CVS_PATH
    
    if [[ ! -z $(git status -s) ]]; then
        echo -e " ${Warn} ${YellowBG} 当前工作区有修改，尝试暂存后更新。${Font}"
        git add .
        git stash
        git pull origin master --allow-unrelated-histories --rebase
        git stash pop
    else
        git pull origin master --allow-unrelated-histories --rebase
    fi
    echo -e "\n ================ \n ${Version} ${BlueBG} xiaoyao-cvs 插件版本信息 ${Font} \n ================ \n"
    git log -1 --pretty=format:"%h - %an, %ar (%cd) : %s"
fi

cd $WORK_DIR

echo -e "\n ================ \n ${Info} ${GreenBG} 启动Yunzai-Bot ${Font} \n ================ \n"
node app
