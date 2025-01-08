// ==UserScript==
// @name         Download Audio Transcript
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  下载音频文本记录
// @author       Your name
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建下载按钮
    function createDownloadButton() {
        const button = document.createElement('button');
        button.innerHTML = '下载Transcript';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        button.style.padding = '10px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';

        button.addEventListener('click', downloadTranscript);
        document.body.appendChild(button);
    }

    // 提取文本内容
    function extractTranscript() {
        return new Promise(async (resolve) => {
            // 找到正确的滚动容器
            const scrollContainer = document.querySelector('[class*="content_"]') ||
                                  Array.from(document.querySelectorAll('div')).find(div =>
                                      div.scrollHeight > div.clientHeight &&
                                      div.textContent.includes('发言人 1'));

            if (!scrollContainer) {
                console.error('未找到滚动容器');
                resolve('');
                return;
            }

            // 先滚动到顶部
            scrollContainer.scrollTop = 0;
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 滚动到底部并收集所有对话
            let allDialogues = [];
            let processedTexts = new Set(); // 用于去重

            async function scrollAndCollect() {
                return new Promise((resolve) => {
                    let lastScrollHeight = scrollContainer.scrollHeight;
                    let lastDialoguesLength = 0;

                    function scroll() {
                        // 收集当前可见的对话
                        const containers = Array.from(scrollContainer.querySelectorAll('div')).filter(div => {
                            const text = div.textContent || '';
                            return (text.includes('发言人 1') || text.includes('发言人 2')) &&
                                   text.match(/\d{2}:\d{2}/);
                        });

                        containers.forEach((container) => {
                            try {
                                const text = container.textContent;
                                const speakerMatch = text.match(/发言人 [12]/);
                                const timeMatch = text.match(/(\d{2}:\d{2})/);

                                if (speakerMatch && timeMatch) {
                                    const speakerName = speakerMatch[0].replace('发言人', 'Speaker');
                                    const time = timeMatch[1];
                                    let content = text.split(time)[1] || '';
                                    content = content.replace(/发言人 [12]/g, '').trim();

                                    // 使用说话者+时间作为唯一标识
                                    const key = `${speakerName}:${time}`;
                                    if (!processedTexts.has(key) && content) {
                                        processedTexts.add(key);
                                        allDialogues.push({
                                            speakerName,
                                            time,
                                            text: content
                                        });
                                    }
                                }
                            } catch (error) {
                                console.error('处理对话时出错:', error);
                            }
                        });

                        // 继续滚动
                        scrollContainer.scrollTop += 300;

                        setTimeout(() => {
                            const newScrollHeight = scrollContainer.scrollHeight;
                            const newDialoguesLength = allDialogues.length;

                            if (scrollContainer.scrollTop >= scrollContainer.scrollHeight - scrollContainer.clientHeight ||
                                (newScrollHeight === lastScrollHeight && newDialoguesLength === lastDialoguesLength)) {
                                resolve();
                            } else {
                                lastScrollHeight = newScrollHeight;
                                lastDialoguesLength = newDialoguesLength;
                                scroll();
                            }
                        }, 1000);
                    }

                    scroll();
                });
            }

            try {
                await scrollAndCollect();

                // 按时间戳排序
                allDialogues.sort((a, b) => {
                    const timeA = a.time.split(':').map(Number);
                    const timeB = b.time.split(':').map(Number);
                    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
                });

                // 恢复滚动位置
                scrollContainer.scrollTop = 0;

                // 格式化输出
                resolve(allDialogues.map(d => `${d.speakerName}: ${d.time}\n${d.text}\n`).join('\n'));
            } catch (error) {
                console.error('提取文本时出错:', error);
                resolve('');
            }
        });
    }

    // 下载文本文件
    async function downloadTranscript() {
        try {
            const transcript = await extractTranscript();
            if (!transcript) {
                console.error('未找到任何文本内容');
                alert('未能找到文本内容。\n请确保页面已完全加载并包含对话记录。');
                return;
            }

            const BOM = '\uFEFF';
            const blob = new Blob([BOM + transcript], {type: 'text/plain;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');

            a.href = url;
            a.download = 'audio_scripts.txt';
            document.body.appendChild(a);
            a.click();

            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('文件下载成功');
        } catch (error) {
            console.error('下载过程中出错:', error);
            alert('下载过程中出现错误，请查看控制台了解详情');
        }
    }

    // 等待页面加载完成后添加按钮
    window.addEventListener('load', () => {
        setTimeout(createDownloadButton, 1000);
    });
})();