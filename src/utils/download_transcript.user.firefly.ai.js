// ==UserScript==
// @name         Download Audio Transcript
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  从https://app.fireflies.ai/下载音频文本记录
// @author       Your name
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建下载按钮
    function createDownloadButton() {
        const button = document.createElement('button');
        button.innerHTML = '下载audio scripts';
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
        // 查找所有说话者容器
        const speakerContainers = Array.from(document.querySelectorAll('div')).filter(div => {
            return div.textContent.includes('Speaker 1') || div.textContent.includes('Speaker 2');
        });

        if (speakerContainers.length === 0) {
            console.error('未找到说话者容器');
            return '';
        }

        // 先收集所有对话
        let allDialogues = [];
        let processedTexts = new Set();

        speakerContainers.forEach((container) => {
            try {
                const fullContent = container.textContent;

                // 解析说话者名称
                const speakerMatch = fullContent.match(/Speaker [12]/);
                const speakerName = speakerMatch ? speakerMatch[0] : 'Unknown Speaker';

                // 查找时间戳
                const timeMatch = fullContent.match(/\d{2}:\d{2}/);
                const time = timeMatch ? timeMatch[0] : '00:00';

                // 获取说话内容并清理
                let text = fullContent
                    .replace(speakerName, '')
                    .replace(/\d{2}:\d{2}/, '')
                    .replace(/S\d{2}:\d{2}/, '')
                    .replace(/\[.*?\]/g, '')
                    .replace(/\{.*?\}/g, '')
                    .replace(/data-.*?}/g, '')
                    .replace(/^\s*S/, '')
                    .replace(/SSpeaker.*?\n/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                // 检查是否已处理过相同的文本
                const key = `${speakerName}:${text}`;
                if (!processedTexts.has(key) && text && !text.includes('Notes') && !text.includes('Transcript')) {
                    processedTexts.add(key);
                    allDialogues.push({
                        speakerName,
                        time,
                        text
                    });
                }
            } catch (error) {
                console.error('处理对话时出错:', error);
            }
        });

        // 找到最后一次出现 "Speaker 1: 00:00" 的位置
        let lastStartIndex = -1;
        for (let i = 0; i < allDialogues.length; i++) {
            if (allDialogues[i].speakerName === 'Speaker 1' && allDialogues[i].time === '00:00') {
                lastStartIndex = i;
            }
        }

        // 只保留最后一次出现之后的对话
        if (lastStartIndex !== -1) {
            allDialogues = allDialogues.slice(lastStartIndex);
        }

        // 生成最终的文本
        return allDialogues.map(d => `${d.speakerName}: ${d.time}\n ${d.text}\n`).join('\n');
    }

    // 下载文本文件
    function downloadTranscript() {
        try {
            const transcript = extractTranscript();
            if (!transcript) {
                console.error('未找到任何文本内容');
                alert('未能找到文本内容。\n请确保页面已完全加载并包含对话记录。');
                return;
            }

            // 添加 BOM 以确保中文正确显示
            const BOM = '\uFEFF';
            const blob = new Blob([BOM + transcript], {type: 'text/plain;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');

            // 简化文件名
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