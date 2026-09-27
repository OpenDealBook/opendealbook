import { createI18nRequestConfig, type MessagesLoader } from '@tuckin/i18n';

const loadMessages: MessagesLoader = async (locale) => {
  const messages = await import(`../messages/${locale}.json`);

  return messages.default;
};

export default createI18nRequestConfig(loadMessages);
