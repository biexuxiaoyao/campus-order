import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart as clearCartApi,
} from '@/api/cart';
import type { CartItem } from '@/api/cart';

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([]);
  const totalAmount = computed(() =>
    items.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );
  const itemCount = computed(() =>
    items.value.reduce((sum, item) => sum + item.quantity, 0)
  );

  /**
   * 从服务端拉取购物车
   */
  async function fetchCart(): Promise<void> {
    try {
      const data = await getCart();
      items.value = data.items || [];
    } catch (e) {
      console.error('[Cart] 获取购物车失败', e);
      items.value = [];
    }
  }

  /**
   * 添加到购物车
   */
  async function addItem(skuId: string, quantity: number = 1): Promise<void> {
    try {
      await addCartItem(skuId, quantity);
      await fetchCart(); // 重新拉取
      uni.showToast({ title: '已加入购物车', icon: 'success' });
    } catch (e) {
      console.error('[Cart] 添加失败', e);
    }
  }

  /**
   * 更新数量
   */
  async function updateItem(id: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await removeItem(id);
      return;
    }
    try {
      await updateCartItem(id, quantity);
      // 本地同步更新
      const item = items.value.find((i) => i.id === id);
      if (item) {
        item.quantity = quantity;
      }
    } catch {
      // 失败时重新拉取
      await fetchCart();
    }
  }

  /**
   * 删除购物车项
   */
  async function removeItem(id: string): Promise<void> {
    try {
      await removeCartItem(id);
      items.value = items.value.filter((i) => i.id !== id);
    } catch {
      await fetchCart();
    }
  }

  /**
   * 清空购物车
   */
  async function clearCart(): Promise<void> {
    try {
      await clearCartApi();
      items.value = [];
    } catch (e) {
      console.error('[Cart] 清空购物车失败', e);
    }
  }

  return {
    items,
    totalAmount,
    itemCount,
    fetchCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
  };
});
