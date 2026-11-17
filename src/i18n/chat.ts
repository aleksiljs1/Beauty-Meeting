/** Chat sidebar texts (portal and admin). */
export const chatText = {
  open: (unread: number) => (unread > 0 ? `Mesazhet (${unread} të palexuara)` : "Mesazhet"),
  title: "Mesazhet",
  description: "Bisedat tuaja me studentët dhe akademinë.",
  newChat: "Bisedë e re",
  back: "Kthehu",
  empty: "Nuk keni ende biseda.",
  emptyHint: "Nisni një bisedë me “Bisedë e re”.",
  loadError: "Bisedat nuk u ngarkuan. Provoni përsëri.",
  retry: "Provo përsëri",

  you: "Ju",
  deletedMessage: "Mesazhi u fshi",
  noMessagesYet: "Shkruani mesazhin e parë.",
  pinned: "E fiksuar",
  unread: (count: number) => `${count} të palexuara`,
  seen: "Parë",
  loadOlder: "Mesazhet e mëparshme",

  actions: "Veprime",
  pin: "Fikso",
  unpin: "Hiqe fiksimin",
  delete: "Fshi bisedën",
  deleteTitle: "Të fshihet biseda?",
  deleteBody: "Biseda dhe mesazhet e saj hiqen vetëm për ju. Personi tjetër i ruan. Nëse ju shkruan përsëri, biseda rishfaqet me mesazhet e reja.",
  deleteConfirm: "Fshi",
  cancel: "Anulo",
  deleted: "Biseda u fshi.",

  searchLabel: "Kërkoni një person",
  searchPlaceholder: "Shkruani emrin…",
  noPeople: "Nuk u gjet asnjë person.",
  roles: { admin: "Administrator", student: "Student" } as Record<string, string>,

  composerLabel: "Mesazhi",
  composerPlaceholder: "Shkruani një mesazh…",
  send: "Dërgo",
  charsLeft: (left: number) => `${left} karaktere të mbetura`,

  newMessageFrom: (name: string) => `Mesazh i ri nga ${name}`,
  openChat: "Hap",
};
