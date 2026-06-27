export const initialSiteContent = {
    global: {
        siteName: 'Pycasa',
        contactPhone: '+919999999999',
        contactEmail: 'pycasa@email.com',
        address: 'Pycasa, Karnataka',
        footerAbout: 'Pycasa',
    },
};

export const getSiteContent = () => {
    const stored = localStorage.getItem('site_content');
    if (stored) return JSON.parse(stored);
    return initialSiteContent;
};

export const saveSiteContent = (content) => {
    localStorage.setItem('site_content', JSON.stringify(content));
    window.dispatchEvent(new Event('storage-content'));
};
