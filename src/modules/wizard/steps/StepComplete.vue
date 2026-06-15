<template>
  <div class="step-complete">
    <div class="completion">
      <Transition name="bounce" appear>
        <div class="big-icon">🎉</div>
      </Transition>
      <h2>准备好了！</h2>
      <p>你的专属学习路径已生成</p>
      <p class="detail">
        基于你的目标和水平，我们为你推荐了<br />
        西班牙语入门学习内容
      </p>
    </div>
    <div class="wizard-footer">
      <button class="btn-primary" @click="emitNext">开始学习 →</button>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(["next"]);

function emitNext() {
  emit("next");
}
</script>

<style scoped>
.step-complete {
  display: flex;
  flex-direction: column;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.completion {
  text-align: center;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}

.big-icon {
  font-size: 72px;
  margin-bottom: 16px;
}

h2 {
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 8px;
  color: var(--green);
}

p {
  color: var(--text-light);
  font-size: 15px;
  line-height: 1.5;
}

.detail {
  color: var(--text-lighter);
  font-size: 13px;
  margin-top: 12px;
}

.wizard-footer {
  width: 100%;
  padding: 0 0 40px;
}

.btn-primary {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}

.btn-primary:hover {
  background: var(--green-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(88, 204, 2, 0.3);
}

/* Bounce transition */
.bounce-enter-active {
  animation: bounce 0.6s ease;
}

@keyframes bounce {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}
</style>
