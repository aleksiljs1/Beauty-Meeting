/**
 * Explanations behind the round "i" beside form fields, Albanian. One or two plain sentences on
 * what the field is for and who sees it; the short hint under the field stays as it is.
 */
export const fieldInfo = {
  lesson: {
    title: "Emri i mësimit, siç e shohin studentët në listën e mësimeve, në kalendar dhe në emailet e njoftimit.",
    summary: "Një përshkrim i shkurtër i mësimit. E sheh kushdo që e sheh kartën e mësimit, edhe para se të regjistrohet.",
    details:
      "Informacion më i plotë për mësimin (çfarë të sjellin, si përgatiten etj.). E shohin vetëm studentët që kanë akses aktiv në këtë mësim.",
    course:
      "Kursi të cilit i përket mësimi. Studentët e kursit mund të shtohen në mësim me një klikim, dhe mësimi shfaqet te kursi i tyre.",
    image:
      "Fotoja që shohin studentët në kartën dhe faqen e mësimit. Pa foto, mësimi merr fotonë e kursit të tij, ose një kopertinë të dizajnuar në ngjyrat e akademisë.",
    start: "Data dhe ora kur fillon mësimi, sipas orës së Tiranës.",
    end: "Data dhe ora kur mbaron mësimi. Ndihmon për kalendarin dhe kufirin e 3 mësimeve në të njëjtën kohë.",
    joinOpens: "Nga ky moment studentët e regjistruar mund të hyjnë në klasën live. Zakonisht 15 minuta para fillimit.",
    deadline:
      "Deri kur studentët kanë akses në këtë mësim: klasën live, regjistrimet dhe materialet. Pas këtij momenti mësimi mbyllet për ta.",
    repeatUntil: "Dita e fundit kur krijohet një mësim i përsëritur. Krijohet një mësim për çdo ditë të zgjedhur të javës deri në këtë datë.",
  },
  series: {
    startTime: "Ora e re e fillimit për të gjitha datat e ardhshme të serisë. Datat që kanë kaluar nuk ndryshojnë.",
    duration: "Sa minuta zgjat secili mësim i serisë. Përfundimi llogaritet nga ora e fillimit.",
  },
  invitation: {
    maxRedemptions: "Sa studentë mund të bashkohen me këtë lidhje. Lëreni bosh që ta përdorë kushdo që e ka lidhjen.",
    redeemUntil: "Pas kësaj date lidhja nuk pranon më studentë të rinj. Studentët që u bashkuan më parë e mbajnë aksesin.",
    accessUntil:
      "Për studentët që bashkohen me këtë lidhje, aksesi mund të mbarojë më herët se afati i mësimit. Lëreni bosh për të njëjtin afat si mësimi.",
  },
  roster: {
    search: "Shkruani emrin ose emailin e studentit për ta shtuar në këtë mësim, edhe nëse nuk është në kursin e mësimit.",
    personalDeadline:
      "Një afat vetëm për këtë student, për ta mbyllur aksesin më herët. Nuk mund ta zgjasë aksesin përtej afatit të mësimit.",
  },
  material: {
    rename: "Emri që shohin studentët për këtë skedar. Skedari vetë nuk ndryshon.",
  },
  payment: {
    months: "Sa muaj mbulon kjo pagesë. Muajt numërohen nga muaji i parë i papaguar i studentit.",
    amount: "Shuma që pagoi studenti, në euro. Plotësohet me çmimin mujor; ndryshojeni nëse pati zbritje.",
    paidOn: "Dita kur studenti pagoi realisht, jo dita kur e regjistroni. Nuk mund të jetë në të ardhmen.",
    method: "Si u pagua: para në dorë, transfertë bankare ose ndryshe. Vetëm për evidencën tuaj.",
    note: "Çdo gjë që doni të mbani mend për këtë pagesë, p.sh. numri i faturës. E shihni vetëm ju.",
    firstMonth:
      "Muaji i kursit nga i cili studenti fillon të paguajë, për ata që u futën në kurs më vonë. Muajt para tij nuk llogariten si borxh.",
  },
  student: {
    name: "Emri dhe mbiemri i studentit, siç shfaqet në panel, në listat e mësimeve dhe në emailet që i dërgohen.",
    email:
      "Studenti hyn në llogari me këtë email, dhe këtu i vjen emaili për të vendosur fjalëkalimin. Duhet të jetë i saktë dhe i pashfrytëzuar nga një llogari tjetër.",
    newEmail:
      "Emaili i ri i hyrjes. Studenti del nga llogaria kudo, lidhjet e vjetra pushojnë së punuari dhe në adresën e re i vjen një email për fjalëkalimin.",
    phone: "Numri për t'u kontaktuar, p.sh. +355 69 123 4567. E shihni vetëm ju.",
    birthDate: "Datëlindja e studentit. Opsionale, vetëm për evidencën tuaj.",
    gender: "Opsionale, vetëm për evidencën tuaj.",
    city: "Qyteti ku jeton studenti. Opsionale, vetëm për evidencën tuaj.",
    notes: "Shënime të brendshme për studentin. Studenti nuk i sheh kurrë.",
  },
  course: {
    title: "Emri i kursit në faqen publike dhe në panel. Në importin nga Excel, kolona Abonimet duhet ta ketë emrin saktësisht kështu.",
    image:
      "Fotoja e kursit në faqen Akademia dhe te mësimet e tij që nuk kanë foto të vetën. Zgjidhni një nga galeria ose ngarkoni një të re. Pa foto, shfaqet një kopertinë e dizajnuar në ngjyrat e akademisë.",
    slug: "Pjesa e fundit e adresës së faqes së kursit, p.sh. /akademia/kursi-i-grimit. Ndryshimi i saj prish lidhjet e vjetra që keni ndarë.",
    summary: "Një ose dy fjali që shfaqen në kartën e kursit te faqja Akademia.",
    description: "Teksti i plotë në faqen e kursit. Lini një rresht bosh për të filluar paragraf të ri.",
    durationText: "Kohëzgjatja siç shfaqet në faqen publike, me fjalë të lira, p.sh. “3 muaj” ose “1 vit”.",
    priceText: "Çmimi siç shfaqet në faqen publike, me fjalë të lira. Pagesat e studentëve llogariten nga “Çmimi mujor” më poshtë.",
    startsOn: "Dita kur fillon kursi. Prej saj numërohen muajt e kursit te “Pagesat”.",
    durationYears: "Sa vite zgjat kursi, bashkë me muajt pranë. Përcakton sa muaj duhet të paguajë një student.",
    durationMonths: "Muajt përveç viteve, p.sh. 1 vit e 6 muaj. Përcakton sa muaj duhet të paguajë një student.",
    monthlyPrice: "Sa paguan një student në muaj, në euro. Plotësohet vetë kur regjistroni një pagesë.",
  },
  service: {
    title: "Emri i shërbimit siç shfaqet te faqja Shërbimet.",
    description: "Pak fjalë për shërbimin. Lini një rresht bosh për të filluar paragraf të ri.",
    priceText: "Çmimi me fjalë të lira, p.sh. “nga 1500 lekë”. Lëreni bosh që të mos shfaqet çmim.",
  },
  gallery: {
    file: "Fotoja që do të shfaqet te Galeria. JPG, PNG ose WebP, deri në 10 MB.",
    alt: "Një përshkrim i shkurtër i asaj që shihet në foto. E lexojnë me zë programet për personat që nuk shohin dhe e përdor Google.",
    caption: "Teksti i vogël që shfaqet poshtë fotos në Galeri. Opsional.",
  },
  settings: {
    name: "Emri i akademisë siç shfaqet në faqen publike.",
    tagline: "Fjalia e shkurtër në krye të faqes kryesore.",
    about: "Teksti i faqes Rreth nesh. Lini një rresht bosh për të filluar paragraf të ri.",
    address: "Adresa e sallonit, siç e shohin vizitorët te Kontakti.",
    phone: "Numri që shohin vizitorët te Kontakti. Në telefon e thërrasin me një prekje.",
    email: "Emaili publik i akademisë për pyetje. Nuk ka lidhje me emailet që dërgon faqja.",
    whatsapp: "Numri i WhatsApp-it me prefiksin e shtetit. Vizitorët ju shkruajnë me një prekje. Lëreni bosh nëse nuk e përdorni.",
    mapUrl: "Lidhja e vendndodhjes nga Google Maps (Ndaj → Kopjo lidhjen). Vizitorët e hapin nga faqja Kontakt.",
    instagramUrl: "Adresa e plotë e profilit në Instagram, p.sh. https://instagram.com/akademia. Lëreni bosh që të mos shfaqet.",
    facebookUrl: "Adresa e plotë e faqes në Facebook. Lëreni bosh që të mos shfaqet.",
    hoursDays: "Ditët për këtë rresht të orarit, p.sh. “E hënë – E premte”.",
    hoursHours: "Orari për këto ditë, p.sh. “09:00 – 19:00” ose “Mbyllur”.",
  },
  toggles: {
    coursePublic: "Kur është aktive, kursi shfaqet te faqja Akademia për vizitorët. Kur është e fikur, e shihni vetëm ju në panel; studentët dhe mësimet e kursit nuk preken.",
    servicePublic: "Kur është aktive, shërbimi shfaqet te faqja Shërbimet. Kur është e fikur, mbetet i ruajtur këtu, por vizitorët nuk e shohin.",
    photoPublic: "Kur është aktive, fotoja shfaqet në vendet e zgjedhura më sipër. Kur është e fikur, ruhet këtu pa u shfaqur askund.",
    addToUpcoming:
      "Studenti regjistrohet menjëherë edhe në mësimet e ardhshme që janë krijuar tashmë për kurset e tij. Pa këtë, futet vetëm në mësimet që krijohen nga tani e tutje.",
  },
  reminder: {
    toggle:
      "Kur është aktive, ju vjen një email para çdo mësimi të publikuar, me orën e fillimit dhe lidhjen te mësimi. Draftet, mësimet e anuluara dhe ato që kanë nisur nuk kujtohen.",
    lead: "Sa kohë para fillimit të mësimit vjen emaili, nga 5 minuta deri në 24 orë. Po aq kohë para, në krye të çdo faqeje të panelit shfaqet edhe klasa që po fillon, me butonin \"Nis klasën\" (edhe kur emaili është i çaktivizuar). Nëse e ndryshoni kur një mësim është afër, kujtesa vjen menjëherë.",
    email: "Adresa ku vijnë kujtesat. Lëreni bosh që të vijnë në emailin me të cilin hyni në panel.",
  },
  auth: {
    email: "Emaili me të cilin akademia ju regjistroi.",
    password: "Fjalëkalimi që vendosët nga emaili i akademisë. Nëse e keni harruar, përdorni lidhjen më poshtë.",
    currentPassword: "Fjalëkalimi që përdorni tani për të hyrë.",
    newPassword: "Të paktën 10 karaktere. Zgjidhni diçka që nuk e përdorni në faqe të tjera.",
    confirmPassword: "Shkruani të njëjtin fjalëkalim edhe një herë, që të jeni të sigurt se nuk ka gabim shkrimi.",
    resetEmail: "Emaili i llogarisë suaj. Nëse ekziston një llogari me të, ju vjen një lidhje për fjalëkalim të ri, e vlefshme 1 orë.",
  },
} as const;
