import { encode, decode } from '@frsource/base64';
/**
 * 解码 Base64 编码的字符串
 * @param base64String Base64 编码的字符串
 * @returns 解码后的文本或原始字符串（解码失败时）
 */
export const decodeBase64Value = (base64String: string): string => {
  try {
    // 使用@frsource/base64 库解码
    return decode(base64String);
  } catch (e) {
    console.error('Error decoding Base64:', e);
    
    // 如果解码失败，返回原始字符串
    return base64String;
  }
};