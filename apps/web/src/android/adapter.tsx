"use client";

import { useEffect } from "react";
import { installChinese } from "./localize";

/**
 * 判定条件：WebView 容器（OpenCutActivity）在 UA 末尾追加了 MinewaysApp。
 * 调试钩子：浏览器里把 localStorage 的 mw-android-ui 设成 "1" 也能启用，方便
 * 在不装机的情况下核对横屏布局。
 */
const BOOTSTRAP = `(function(){try{
var on=/MinewaysApp/.test(navigator.userAgent)||localStorage.getItem('mw-android-ui')==='1';
if(!on)return;
var d=document.documentElement;
d.setAttribute('data-android','1');
d.setAttribute('lang','zh-CN');
/* 手机横屏只有约 336px 高：上游默认 50/50 的纵切会让画面和时间轴各占一半，
   画面被控制条一挤就只剩 130px 上下，这里把纵切压到 65/35（画面多长 30px，
   时间轴靠竖向滚动看后面的轨道）。键名与 src/editor/panel-store.ts 的 zustand
   persist 结构一致。tools 给到 26%（约 207px）是算出来的：素材栏头部自身要
   162px，再加 40px 的竖向图标栏和分隔线，20% 会把「导入」挤到面板外被裁掉。
   preview/properties 是横向占比。 */
var K='panel-sizes',V='mw-panel-seed';
var want={tools:26,preview:46,properties:28,mainContent:65,timeline:35};
/* 更矮的横屏（20:9 手机约 360 CSS 高）里 35% 只够露一条轨道，起手就得手动拉
   分隔条才放得下第二个素材，所以按视口高度分档：这类机型默认给工程区四成。
   横向比例不动——素材栏头部自身要 162px，tools 低于 26% 会把「导入」挤出面板。 */
var h=innerHeight||screen.height||0;
if(h&&h<400){want.mainContent=60;want.timeline=40;}
/* WebView 的 localStorage 跨版本存活：旧包里存下的比例会顶掉新适配，所以按种子版本号
   强制刷新一次；同一版本内用户自己拖的比例照常保留。 */
if(localStorage.getItem(V)!=='3'){localStorage.setItem(V,'3');localStorage.setItem(K,JSON.stringify({state:{panels:want},version:2}));}
}catch(e){}})();`;

/** 放进 <head>：内联脚本会在 Next 的模块 chunk（defer）之前执行，首帧就是紧凑布局。 */
export function AndroidBootstrap() {
	return <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />;
}

export function AndroidLocalize() {
	useEffect(() => {
		if (!document.documentElement.hasAttribute("data-android")) return;
		installChinese();
	}, []);
	return null;
}
