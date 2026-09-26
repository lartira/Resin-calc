// Helper to detect system language
export const getSystemLanguage = () => {
    const rawLang = navigator.language || navigator.userLanguage || 'en';
    const langCode = rawLang.split('-')[0];

    // Map special cases
    if (langCode === 'nb' || langCode === 'nn') return 'no';

    // Supported languages
    const supported = ['da', 'en', 'sv', 'no', 'de', 'pl', 'cs', 'hu', 'ro', 'bg'];
    return supported.includes(langCode) ? langCode : 'en'; // Default to English if not supported
};
