<script setup>
import { computed } from "vue";
import MarkdownIt from "markdown-it";

const props = defineProps({ content: { type: String, default: "" } });
const md = new MarkdownIt({ html: false, breaks: true, linkify: true });
const linkOpen = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return linkOpen(tokens, index, options, env, self);
};
md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const source = token.attrGet("src") || "";
  const name = md.utils.escapeHtml(token.content || "附件");
  return md.validateLink(source)
    ? `<a href="${md.utils.escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : name;
};
const rendered = computed(() => md.render(props.content));
</script>

<template><article class="markdown" v-html="rendered"></article></template>
