import Bowser from 'bowser';

const platform = Bowser.getParser(navigator.userAgent).getPlatformType();

if (platform === 'mobile' || platform === 'tablet') {
  const { default: eruda } = await import('eruda');
  eruda.init();
}
