/** Public website copy (Albanian). Business facts come from the database, never from here. */
export const publicSite = {
  nav: {
    home: "Kreu",
    about: "Rreth nesh",
    services: "Shërbimet",
    academy: "Akademia",
    gallery: "Galeria",
    contact: "Kontakt",
    signIn: "Hyr",
    menu: "Menyja",
    openMenu: "Hap menynë",
    closeMenu: "Mbyll menynë",
    mainNav: "Navigimi kryesor",
    skipToContent: "Kalo te përmbajtja",
  },

  footer: {
    contact: "Kontakti",
    hours: "Orari",
    pages: "Faqet",
    privacy: "Privatësia",
    terms: "Kushtet e përdorimit",
    studentPortal: "Hyrja për studentët",
    rights: "Të gjitha të drejtat e rezervuara.",
  },

  home: {
    eyebrow: "Sallon bukurie · Akademi estetike",
    heroFallback: "Kujdes profesional për bukurinë dhe formim praktik për ata që duan ta bëjnë atë profesion.",
    heroCtaCourses: "Shiko kurset",
    heroCtaContact: "Na kontaktoni",
    servicesEyebrow: "Salloni",
    servicesTitle: "Shërbimet tona",
    servicesAll: "Të gjitha shërbimet",
    academyEyebrow: "Akademia",
    academyTitle: "Kurset e akademisë",
    academyIntro: "Kurse për ata që duan të mësojnë profesionin e bukurisë, me mësime në sallë dhe online.",
    academyAll: "Të gjitha kurset",
    galleryEyebrow: "Galeria",
    galleryTitle: "Nga puna jonë",
    galleryAll: "Shiko galerinë",
    onlineEyebrow: "Mësim online",
    onlineTitle: "Mësoni edhe nga shtëpia",
    onlineIntro: "Studentët e akademisë kanë një portal personal ku i gjejnë të gjitha mësimet e tyre në një vend.",
    onlineFeatures: [
      { title: "Mësime live online", body: "Merrni pjesë në mësim në kohë reale nga kompjuteri ose telefoni, pa pasur nevojë të jeni në sallë." },
      { title: "Materiale për çdo mësim", body: "Lexoni udhëzuesit dhe materialet e mësimit pranë klasës, gjatë dhe pas saj." },
      { title: "Regjistrime për ta parë sërish", body: "Rishikoni regjistrimin e mësimit sa herë të doni, brenda periudhës së aksesit të kursit." },
    ],
    onlineCta: "Hyrja në portal",
    contactTitle: "Keni pyetje?",
    contactBody: "Na shkruani ose na telefononi për terminet në sallon ose për informacion rreth kurseve.",
    contactCta: "Kontakti",
  },

  about: {
    title: "Rreth nesh",
    description: "Njihuni me sallonin dhe akademinë.",
    empty: "Teksti për sallonin dhe akademinë do të publikohet së shpejti.",
  },

  services: {
    title: "Shërbimet",
    description: "Shërbimet e sallonit tonë të bukurisë.",
    intro: "Shërbimet që ofrojmë në sallon. Për termine dhe informacion të mëtejshëm, na kontaktoni.",
    empty: "Lista e shërbimeve do të publikohet së shpejti.",
    priceLabel: "Çmimi",
  },

  academy: {
    title: "Akademia",
    description: "Kurset e akademisë sonë estetike.",
    intro: "Kurset e akademisë kombinojnë praktikën në sallë me mësime live online, materiale dhe regjistrime për studentët e regjistruar.",
    empty: "Kurset do të publikohen së shpejti. Na kontaktoni për informacion.",
    details: "Më shumë",
    duration: "Kohëzgjatja",
    price: "Çmimi",
    backToCourses: "Të gjitha kurset",
    enquiryTitle: "Interesoheni për këtë kurs?",
    enquiryBody: "Na kontaktoni për datat e ardhshme, kushtet dhe regjistrimin.",
    enquiryWhatsapp: "Shkruani në WhatsApp",
    enquiryPhone: "Telefononi",
    enquiryEmail: "Dërgoni email",
    enquiryContactPage: "Faqja e kontaktit",
    enquiryMessage: (course: string) => `Përshëndetje! Dëshiroj informacion për kursin “${course}”.`,
    enquiryEmailSubject: (course: string) => `Informacion për kursin “${course}”`,
    notFoundTitle: "Kursi nuk u gjet",
    notFoundBody: "Ky kurs nuk ekziston ose nuk është më i publikuar.",
  },

  gallery: {
    title: "Galeria",
    description: "Foto nga puna dhe ambienti i sallonit.",
    intro: "Disa nga punimet tona dhe ambienti i sallonit.",
    empty: "Fotot e galerisë do të publikohen së shpejti.",
  },

  contact: {
    title: "Kontakt",
    description: "Adresa, orari dhe mënyrat për të na kontaktuar.",
    intro: "Na gjeni në sallon ose na kontaktoni për termine dhe informacion rreth kurseve.",
    address: "Adresa",
    hours: "Orari i punës",
    phone: "Telefoni",
    email: "Email",
    whatsapp: "WhatsApp",
    whatsappCta: "Shkruani në WhatsApp",
    map: "Hap në hartë",
    social: "Na ndiqni",
    notProvided: "Do të publikohet së shpejti.",
  },

  legal: {
    draftBadge: "Draft — kërkon rishikim nga biznesi",
    draftNote:
      "Ky tekst është një draft fillestar për diskutim. Nuk është rishikuar nga biznesi apo nga një jurist dhe nuk duhet konsideruar si dokument përfundimtar ose ligjor.",
    privacy: {
      title: "Privatësia",
      description: "Draft i politikës së privatësisë.",
      sections: [
        {
          heading: "Çfarë të dhënash mbledhim",
          body: "Kur na kontaktoni, ruajmë vetëm të dhënat që na jepni (p.sh. emrin, numrin e telefonit ose email-in) për t’ju përgjigjur. Për studentët e akademisë ruajmë emrin, email-in dhe informacionin e nevojshëm për aksesin në mësime.",
        },
        {
          heading: "Si i përdorim",
          body: "Të dhënat përdoren për t’ju përgjigjur, për të organizuar terminet dhe kurset, dhe për t’u dhënë studentëve akses në mësimet, materialet dhe regjistrimet e tyre.",
        },
        {
          heading: "Cookies",
          body: "Faqja përdor vetëm cookies të nevojshme për hyrjen në portalin e studentëve. Nuk përdorim cookies reklamuese.",
        },
        {
          heading: "Të drejtat tuaja",
          body: "Mund të kërkoni të shihni, korrigjoni ose fshini të dhënat tuaja duke na kontaktuar nëpërmjet faqes së kontaktit.",
        },
      ],
    },
    terms: {
      title: "Kushtet e përdorimit",
      description: "Draft i kushteve të përdorimit.",
      sections: [
        {
          heading: "Përdorimi i faqes",
          body: "Informacioni në këtë faqe është për qëllime informuese. Çmimet dhe oraret mund të ndryshojnë; konfirmojini ato me ne përpara se të vini.",
        },
        {
          heading: "Portali i studentëve",
          body: "Llogaritë e studentëve krijohen nga akademia. Çdo student është përgjegjës për ruajtjen e fjalëkalimit të vet dhe nuk duhet ta ndajë llogarinë me të tjerë.",
        },
        {
          heading: "Materialet dhe regjistrimet",
          body: "Materialet dhe regjistrimet e mësimeve janë vetëm për përdorim personal të studentëve të regjistruar, brenda periudhës së aksesit. Shpërndarja e tyre nuk lejohet.",
        },
        {
          heading: "Ndryshime",
          body: "Këto kushte mund të përditësohen. Versioni në këtë faqe është ai në fuqi.",
        },
      ],
    },
  },

  notFound: {
    title: "Faqja nuk u gjet",
    body: "Faqja që kërkuat nuk ekziston ose është zhvendosur.",
    home: "Kthehu në faqen kryesore",
  },

  imagePlaceholder: "Fotot do të shtohen së shpejti",
} as const;
