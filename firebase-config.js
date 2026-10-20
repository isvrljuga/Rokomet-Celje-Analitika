// Nastavitve skupne baze (Firebase). Dokler je apiKey prazen, so tekme shranjene samo v napravi.
// 1. https://console.firebase.google.com → Add project → v projektu dodaj spletno aplikacijo (</>)
//    in sem prepiši vrednosti iz »firebaseConfig«.
// 2. Build → Authentication → Sign-in method → Google: Enable in Email/Password: Enable.
//    Authentication → Settings → Authorized domains: dodaj isvrljuga.github.io.
// 3. Build → Firestore Database → Create database, nato v zavihek »Rules« prilepi vsebino firestore.rules.
// 4. Po prvi prijavi v aplikaciji (zavihek Izvoz) prepiši svoj ID v adminUids tukaj in v firestore.rules.
// Ključ apiKey ni skrivnost; dostop varujejo pravila v firestore.rules.
window.CELJE_CLOUD=window.CELJE_CLOUD||{
  firebase:{apiKey:'AIzaSyCAbxIDxdS-GVi7vwqKC7Ksirs6s_m_vqI',authDomain:'rokomet-celje.firebaseapp.com',projectId:'rokomet-celje',storageBucket:'rokomet-celje.firebasestorage.app',messagingSenderId:'15782311672',appId:'1:15782311672:web:d90401f24508aab23f2d0d'},
  adminUids:['mGyEsmEYYQYvgIVbFYFbReSeDRd2']
};
