<script setup>
import { Check, Connection, Delete, Plus, Refresh, Select, Setting } from "@element-plus/icons-vue";
import IconButton from "./IconButton.vue";

defineProps({ workspace: Object });
defineEmits(["remove-channel", "clear-credential"]);
</script>

<template>
  <form class="settings-form" @submit.prevent="workspace.saveSettings()">
    <div class="page-heading">
      <div><span class="eyebrow">WORKSPACE SETTINGS</span><h1>连接与设置</h1></div>
      <div class="heading-actions">
        <span class="save-status" :class="{ changed: workspace.dirty }">{{ workspace.saving ? "保存中" : workspace.dirty ? "未保存更改" : "已保存" }}</span>
        <button type="submit" class="button primary" :disabled="workspace.saving"><Check class="icon" />保存设置</button>
      </div>
    </div>
    <fieldset class="settings-content" :disabled="workspace.saving">
    <section class="settings-section">
      <div class="section-label"><Connection class="icon" /><h2>服务连接</h2></div>
      <div class="settings-fields">
        <div class="field-row">
          <label class="field"><span>Discord Token <span class="status-pill" :class="{ ok: workspace.cfg.discordTokenSet }">{{ workspace.cfg.discordTokenSet ? "服务端已配置" : "未配置" }}</span></span>
            <div class="input-action"><input v-model="workspace.credentials.discordToken" type="password" autocomplete="new-password" placeholder="新凭据" aria-label="新的 Discord Token" />
              <IconButton v-if="workspace.cfg.discordTokenSet" label="移除 Discord 凭据" :icon="Delete" @click="$emit('clear-credential', 'discordToken')" />
            </div>
          </label>
          <label class="field"><span>API Key <span class="status-pill" :class="{ ok: workspace.cfg.apiKeySet }">{{ workspace.cfg.apiKeySet ? "服务端已配置" : "未配置" }}</span></span>
            <div class="input-action"><input v-model="workspace.credentials.apiKey" type="password" autocomplete="new-password" placeholder="新凭据" aria-label="新的 API Key" />
              <IconButton v-if="workspace.cfg.apiKeySet" label="移除模型凭据" :icon="Delete" @click="$emit('clear-credential', 'apiKey')" />
            </div>
          </label>
        </div>
        <label class="field"><span>Discord 专用代理（HTTP / HTTPS）</span><input v-model.trim="workspace.cfg.discordProxy" type="url" placeholder="http://127.0.0.1:7890" /></label>
        <div class="schedule-detail"><span>Discord：{{ workspace.cfg.discordProxy ? "使用专用代理" : "直连" }}</span><strong>AI 分析 / 模型列表：直连</strong></div>
        <label class="field"><span>API Base</span><input v-model.trim="workspace.cfg.apiBase" type="url" placeholder="http://127.0.0.1:8888/v1" /></label>
        <div class="field-row">
          <label class="field"><span>模型</span>
            <div class="input-action"><input v-model="workspace.cfg.model" list="model-list" placeholder="模型名称" />
              <IconButton label="获取模型列表" :icon="Refresh" :spinning="workspace.modelsLoading" :disabled="workspace.modelsLoading || workspace.saving" @click="workspace.loadModels()" />
            </div>
            <datalist id="model-list"><option v-for="model in workspace.models" :key="model" :value="model" /></datalist>
          </label>
          <label class="field"><span>接口协议</span><select v-model="workspace.cfg.protocol"><option value="chat">Chat Completions</option><option value="responses">Responses</option></select></label>
        </div>
      </div>
    </section>
    <section class="settings-section">
      <div class="section-label"><span class="hash-icon">#</span><h2>频道管理</h2><span class="count-label">{{ workspace.channels.length }}</span></div>
      <div class="settings-fields">
        <div class="channel-add">
          <input v-model.trim="workspace.newChannel" aria-label="新频道 ID" placeholder="频道 ID" inputmode="numeric" @keydown.enter.prevent="workspace.checkChannel(workspace.newChannel)" />
          <button type="button" class="button" :disabled="!!workspace.checking || !workspace.newChannel" @click="workspace.checkChannel(workspace.newChannel)"><Plus class="icon" />添加并检测</button>
        </div>
        <div v-for="channel in workspace.channels" :key="channel.id" class="settings-channel">
          <span class="channel-avatar">#</span>
          <div class="channel-identity"><strong>{{ channel.name }}</strong><small>{{ channel.id }}<template v-if="channel.guild"> · {{ channel.guild }}</template></small></div>
          <span class="channel-pointer">{{ workspace.pointers[channel.id]?.lastTs || "未建立增量指针" }}</span>
          <IconButton label="检测频道" :icon="Select" :disabled="!!workspace.checking" @click="workspace.checkChannel(channel.id)" />
          <IconButton label="移除频道" :icon="Delete" @click="$emit('remove-channel', channel)" />
        </div>
        <div v-if="!workspace.channels.length" class="empty-inline">暂无频道</div>
      </div>
    </section>
    <section class="settings-section">
      <div class="section-label"><Setting class="icon" /><h2>总结参数</h2></div>
      <div class="settings-fields">
        <div class="field-row">
          <label class="field"><span>默认时间范围（小时）</span><input v-model.number="workspace.cfg.hours" type="number" min="0" max="8760" step="1" required /></label>
          <label class="field"><span>单次消息上限</span><input v-model.number="workspace.cfg.limit" type="number" min="1" max="100000" step="1" required /></label>
        </div>
        <label class="field"><span>自定义提示词</span><textarea v-model="workspace.cfg.customPrompt" rows="6" placeholder="默认结构化总结" /></label>
      </div>
    </section>
    <section class="settings-section">
      <div class="section-label"><Refresh class="icon" /><h2>定时任务</h2></div>
      <div class="settings-fields">
        <label class="switch-field"><span>自动增量总结</span><input v-model="workspace.cfg.scheduleEnabled" type="checkbox" role="switch" /><span class="switch-track" aria-hidden="true"></span></label>
        <div class="field-row">
          <label class="field"><span>执行间隔（小时）</span><input v-model.number="workspace.cfg.scheduleHours" type="number" min="0.25" max="168" step="0.25" required /></label>
          <label class="field"><span>单次消息上限（0 = 不限）</span><input v-model.number="workspace.cfg.scheduleLimit" type="number" min="0" max="100000" required /></label>
        </div>
        <div class="schedule-detail"><span>调度线程</span><strong>{{ workspace.schedule.active ? "运行中" : workspace.cfg.scheduleEnabled ? "本次启动未启用" : "已关闭" }}</strong></div>
        <div class="schedule-detail"><span>上次执行</span><strong>{{ workspace.schedule.lastRun || "未运行" }}</strong></div>
        <div class="schedule-detail"><span>下次执行</span><strong>{{ workspace.schedule.nextRun || "-" }}</strong></div>
        <div><button type="button" class="button" :disabled="workspace.busy || !workspace.channels.length || !workspace.cfg.discordTokenSet" @click="workspace.runSchedule()"><Refresh class="icon" />立即执行一次</button></div>
      </div>
    </section>
    </fieldset>
  </form>
</template>
