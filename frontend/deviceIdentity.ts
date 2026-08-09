const DEVICE_KEY = 'kazeabc_device_id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getSharedDeviceId = () => {
  const cookieValue = document.cookie.split('; ').find(item => item.startsWith(`${DEVICE_KEY}=`))?.split('=')[1];
  const localValue = localStorage.getItem(DEVICE_KEY);
  const id = [cookieValue, localValue].find(value => value && UUID_PATTERN.test(value)) || crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, id);
  const sharedDomain = location.hostname === 'kazeabc.com' || location.hostname.endsWith('.kazeabc.com');
  document.cookie = `${DEVICE_KEY}=${id}; Max-Age=31536000; Path=/; SameSite=Lax${sharedDomain ? '; Domain=kazeabc.com; Secure' : ''}`;
  return id;
};
