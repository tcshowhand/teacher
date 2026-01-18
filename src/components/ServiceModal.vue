<script setup>
defineEmits(['close'])
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content service-modal">
      <h3>💎 定制教案模型</h3>
      <div class="service-content">
        <p>我们可以为您定制专属的教案模型！</p>
        <p class="price">
          <span class="original-price">原价3000元</span>
          <br>
          <span class="promo-text">限时优惠：</span>
          <span class="highlight">300元/个</span>
        </p>
        <p class="contact">联系我们添加您的专属模板。</p>
        <p class="contact">微信：cnatking</p>
      </div>
      <div class="modal-actions">
        <button class="modal-btn confirm" @click="$emit('close')">知道了</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(3px);
}

.service-modal {
  background: #fff;
  padding: 40px;
  border-radius: 20px;
  width: 90%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  border: 4px solid #f1c40f;
  background-image: linear-gradient(135deg, #fff 0%, #fffbf0 100%);
}

h3 {
  color: #f39c12;
  font-size: 1.8em;
  margin-bottom: 20px;
  font-weight: bold;
}

.service-content {
  font-size: 1.2em;
  line-height: 1.6;
  color: #2c3e50;
  margin-bottom: 30px;
}

.price {
  margin: 15px 0;
  font-weight: bold;
}

.original-price {
  text-decoration: line-through;
  color: #95a5a6;
  font-size: 0.9em;
  margin-right: 10px;
}

.promo-text {
  font-weight: bold;
  color: #2c3e50;
}

.highlight {
  color: #e74c3c;
  font-size: 1.8em;
  margin: 0 5px;
  font-weight: bold;
}

.contact {
  font-size: 0.9em;
  color: #7f8c8d;
}

.modal-actions {
  display: flex;
  justify-content: center;
}

.modal-btn {
  padding: 10px 40px;
  border: none;
  background: linear-gradient(to right, #f1c40f, #f39c12);
  color: white;
  font-size: 1.2em;
  border-radius: 30px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 4px 10px rgba(241, 196, 15, 0.4);
  transition: transform 0.2s;
}

.modal-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(241, 196, 15, 0.5);
}
</style>
