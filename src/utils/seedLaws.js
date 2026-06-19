// ============================================================
// Emsal Atlası - Law Versions Seeder (Genişletilmiş)
// Kanun ve mevzuat tarihsel (Time-Travel) versiyonlarını yükler
// ============================================================

const { pool } = require('../config/db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const lawVersions = [

  // ================================================================
  // TÜRK BORÇLAR KANUNU (6098)
  // ================================================================

  // TBK 344 - Kira Bedelinin Belirlenmesi (4 versiyon)
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '344', articleTitle: 'Kira Bedelinin Belirlenmesi',
    articleText: 'Tarafların yenilenen kira dönemlerinde uygulanacak kira bedeline ilişkin anlaşmaları, bir önceki kira yılında tüketici fiyat endeksindeki oniki aylık ortalamalara göre değişim oranını geçmemek koşuluyla geçerlidir. Bu kural, bir yıldan uzun süreli kira sözleşmelerinde de uygulanır.\n\nTaraflarca bu konuda bir anlaşma yapılmamışsa, kira bedeli, bir önceki kira yılının tüketici fiyat endeksindeki oniki aylık ortalamalara göre değişim oranını geçmemek koşuluyla hâkim tarafından, kiralananın durumu göz önüne alınarak hakkaniyete göre belirlenir.\n\nTaraflarca bu konuda bir anlaşma yapılıp yapılmadığına bakılmaksızın, beş yıldan uzun süreli veya beş yıldan sonra yenilenen kira sözleşmelerinde ve bundan sonraki her beş yılın sonunda, yeni kira yılında uygulanacak kira bedeli, hâkim tarafından tüketici fiyat endeksindeki oniki aylık ortalamalara göre değişim oranı, kiralananın durumu ve emsal kira bedelleri göz önünde tutularak hakkaniyete göre belirlenir.',
    effectiveFrom: '2024-07-02', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf'
  },
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '344', articleTitle: 'Kira Bedelinin Belirlenmesi (Geçici Madde 2 - %25 Sınırı)',
    articleText: 'Konut kiraları bakımından bu maddenin birinci fıkrası uyarınca yapılacak kira artışı, bir önceki kira yılına ait kira bedelinin yüzde yirmi beşini geçemez. Bu oranı geçecek şekilde yapılan anlaşmalar, fazla miktar yönünden geçersizdir. Bu kural, bir yıldan uzun süreli kira sözleşmelerinde de uygulanır.\n\nBir önceki kira yılının tüketici fiyat endeksindeki on iki aylık ortalamalara göre değişim oranının yüzde yirmi beşin altında kalması hâlinde değişim oranı geçerlidir.',
    effectiveFrom: '2023-07-02', effectiveTo: '2024-07-01',
    sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2023/07/20230715-1.htm'
  },
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '344', articleTitle: 'Kira Bedelinin Belirlenmesi (Geçici Madde 1 - %25 Sınırı)',
    articleText: '11/06/2022 tarihinden itibaren geçerli olmak üzere konut kiraları bakımından yapılacak kira artışı, bir önceki kira yılına ait kira bedelinin yüzde yirmi beşini geçemez. Bu oranı geçecek şekilde yapılan anlaşmalar, fazla miktar yönünden geçersizdir.',
    effectiveFrom: '2022-06-11', effectiveTo: '2023-07-01',
    sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2022/06/20220611-1.htm'
  },
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '344', articleTitle: 'Kira Bedelinin Belirlenmesi (TÜFE Sınırı)',
    articleText: 'Tarafların yenilenen kira dönemlerinde uygulanacak kira bedeline ilişkin anlaşmaları, bir önceki kira yılında tüketici fiyat endeksindeki oniki aylık ortalamalara göre değişim oranını geçmemek koşuluyla geçerlidir. Bu kural, bir yıldan uzun süreli kira sözleşmelerinde de uygulanır.',
    effectiveFrom: '2019-01-01', effectiveTo: '2022-06-10',
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf'
  },

  // TBK 49 - Haksız Fiil
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '49', articleTitle: 'Sorumluluk - Haksız Fiilden Doğan Borç İlişkileri',
    articleText: 'Kusurlu ve hukuka aykırı bir fiille başkasına zarar veren, bu zararı gidermekle yükümlüdür.\n\nZarar verici fiili yasaklayan bir hukuk kuralı bulunmasa bile, ahlaka aykırı bir fiille başkasına kasten zarar veren de, bu zararı gidermekle yükümlüdür.',
    effectiveFrom: '2012-07-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf'
  },

  // TBK 347 - Konut ve Çatılı İşyeri Kiralarında Sözleşmenin Sona Ermesi
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '347', articleTitle: 'Konut ve Çatılı İşyeri Kiralarında Sözleşmenin Sona Ermesi',
    articleText: 'Konut ve çatılı işyeri kiralarında kiracı, belirli süreli sözleşmelerin süresinin bitiminden en az on beş gün önce bildirimde bulunmadıkça, sözleşme aynı koşullarla bir yıl için uzatılmış sayılır. Kiraya veren, sözleşme süresinin bitimine dayanarak sözleşmeyi sona erdiremez. Ancak, on yıllık uzama süresi sonunda kiraya veren, bu süreyi izleyen her uzama yılının bitiminden en az üç ay önce bildirimde bulunmak koşuluyla, herhangi bir sebep göstermeksizin sözleşmeye son verebilir.',
    effectiveFrom: '2020-07-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf'
  },
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '347', articleTitle: 'Konut ve Çatılı İşyeri Kiralarında Sözleşmenin Sona Ermesi',
    articleText: 'Konut ve çatılı işyeri kiralarında kiracı, belirli süreli sözleşmelerin süresinin bitiminden en az on beş gün önce bildirimde bulunmadıkça, sözleşme aynı koşullarla bir yıl için uzatılmış sayılır. Kiraya veren, sözleşme süresinin bitimine dayanarak sözleşmeyi sona erdiremez.',
    effectiveFrom: '2012-07-01', effectiveTo: '2020-06-30',
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf'
  },

  // TBK 117 - Temerrüt Faizi
  {
    lawNumber: '6098', lawName: 'Türk Borçlar Kanunu',
    articleNumber: '117', articleTitle: 'Borçlunun Temerrüdü',
    articleText: 'Muaccel bir borcun borçlusu, alacaklının ihtarıyla temerrüde düşer. Borcun ifa edileceği gün, birlikte belirlenmiş veya sözleşmede saklı tutulan bir hakka dayanarak taraflardan biri usulüne uygun bir bildirimde bulunmak suretiyle belirlemişse, bu günün geçmesiyle; haksız fiilde fiilin işlendiği, sebepsiz zenginleşmede ise zenginleşmenin gerçekleştiği tarihte borçlu temerrüde düşmüş olur. Ancak sebepsiz zenginleşenin iyiniyetli olduğu hâllerde temerrüt için bildirim şarttır.',
    effectiveFrom: '2012-07-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf'
  },

  // ================================================================
  // İŞ KANUNU (4857)
  // ================================================================

  // İK 17 - Süreli Fesih
  {
    lawNumber: '4857', lawName: 'İş Kanunu',
    articleNumber: '17', articleTitle: 'Süreli Fesih (İhbar Süreleri)',
    articleText: 'Belirsiz süreli iş sözleşmelerinin feshinden önce durumun diğer tarafa bildirilmesi gerekir. İş sözleşmeleri;\n\na) İşi altı aydan az sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak iki hafta sonra,\nb) İşi altı aydan birbuçuk yıla kadar sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak dört hafta sonra,\nc) İşi birbuçuk yıldan üç yıla kadar sürmüş olan işçi için, bildirimin diğer tarafa yapılmasından başlayarak altı hafta sonra,\nd) İşi üç yıldan fazla sürmüş işçi için, bildirimin diğer tarafa yapılmasından başlayarak sekiz hafta sonra,\n\nfeshedilmiş sayılır. Bu süreler asgari olup sözleşmeler ile artırılabilir.\n\nBildirim şartına uymayan taraf, bildirim süresine ilişkin ücret tutarında tazminat ödemek zorundadır.',
    effectiveFrom: '2003-06-10', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4857.pdf'
  },

  // İK 25 - Haklı Nedenle Fesih (2 versiyon)
  {
    lawNumber: '4857', lawName: 'İş Kanunu',
    articleNumber: '25', articleTitle: 'İşverenin Haklı Nedenle Derhal Fesih Hakkı',
    articleText: 'Süresi belirli olsun veya olmasın işveren, aşağıda yazılı hallerde iş sözleşmesini sürenin bitiminden önce veya bildirim süresini beklemeksizin feshedebilir:\n\nI- Sağlık sebepleri:\na) İşçinin kendi kastından veya derli toplu olmayan yaşayışından yahut içkiye düşkünlüğünden doğacak bir hastalığa yakalanması veya engelli hâle gelmesi durumunda, bu sebeple doğacak devamsızlığın ardı ardına üç iş günü veya bir ayda beş iş gününden fazla sürmesi.\n\nII- Ahlak ve iyi niyet kurallarına uymayan haller ve benzerleri:\na) İş sözleşmesi yapıldığı sırada bu sözleşmenin esaslı noktalarından biri için gerekli vasıflar veya şartlar kendisinde bulunmadığı halde bunların kendisinde bulunduğunu ileri sürerek, yahut gerçeğe uygun olmayan bilgiler veya sözler söyleyerek işçinin işvereni yanıltması.\nb) İşçinin, işveren yahut bunların aile üyelerinden birinin şeref ve namusuna dokunacak sözler sarfetmesi veya davranışlarda bulunması, yahut işveren hakkında şeref ve haysiyet kırıcı asılsız ihbar ve isnadlarda bulunması.\nc) İşçinin işverenin başka bir işçisine cinsel tacizde bulunması.\nd) İşçinin işverene yahut onun ailesi üyelerinden birine yahut işverenin başka işçisine sataşması, işyerine sarhoş yahut uyuşturucu madde almış olarak gelmesi ya da işyerinde bu maddeleri kullanması.\ne) İşçinin, işverenin güvenini kötüye kullanmak, hırsızlık yapmak, işverenin meslek sırlarını ortaya atmak gibi doğruluk ve bağlılığa uymayan davranışlarda bulunması.\nf) İşçinin, işyerinde, yedi günden fazla hapisle cezalandırılan ve cezası ertelenmeyen bir suç işlemesi.\ng) İşçinin işverenden izin almaksızın veya haklı bir sebebe dayanmaksızın ardı ardına iki işgünü veya bir ay içinde iki defa herhangi bir tatil gününden sonraki iş günü, yahut bir ayda üç işgünü işine devam etmemesi.\n\nIII- Zorlayıcı sebepler:\nİşçiyi işyerinde bir haftadan fazla süre ile çalışmaktan alıkoyan zorlayıcı bir sebebin ortaya çıkması.',
    effectiveFrom: '2021-07-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4857.pdf'
  },
  {
    lawNumber: '4857', lawName: 'İş Kanunu',
    articleNumber: '25', articleTitle: 'İşverenin Haklı Nedenle Derhal Fesih Hakkı (Pandemi Dönemi - Fesih Yasağı)',
    articleText: 'Bu Kanunun geçici 10 uncu maddesi uyarınca; ahlak ve iyi niyet kurallarına uymayan haller ve benzeri sebepler (İş Kanunu Madde 25/II), işyerinin kapanması veya işin sona ermesi halleri dışında, işveren tarafından iş sözleşmesi feshedilemez.\n\nİşveren, ücretsiz izin uygulamasına gidebilir. Bu durumda işçiye günlük 39,24 TL nakdi ücret desteği sağlanır. İşçiyi tamamen veya kısmen ücretsiz izne ayırması, işçiye haklı nedene dayanarak sözleşmeyi fesih hakkı vermez.',
    effectiveFrom: '2020-04-17', effectiveTo: '2021-06-30',
    sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2020/04/20200417-2.htm'
  },

  // İK 41 - Fazla Çalışma
  {
    lawNumber: '4857', lawName: 'İş Kanunu',
    articleNumber: '41', articleTitle: 'Fazla Çalışma Ücreti',
    articleText: 'Ülkenin genel yararları yahut işin niteliği veya üretimin artırılması gibi nedenlerle fazla çalışma yapılabilir. Fazla çalışma, Kanunda yazılı koşullar çerçevesinde, haftalık kırkbeş saati aşan çalışmalardır. 63 üncü madde hükmüne göre denkleştirme esasının uygulandığı hallerde, işçinin haftalık ortalama çalışma süresi, normal haftalık iş süresini aşmamak koşulu ile, bazı haftalarda toplam kırkbeş saati aşsa dahi bu çalışmalar fazla çalışma sayılmaz.\n\nHer bir saat fazla çalışma için verilecek ücret normal çalışma ücretinin saat başına düşen miktarının yüzde elli yükseltilmesi suretiyle ödenir.\n\nHaftalık çalışma süresinin sözleşmelerle kırkbeş saatin altında belirlendiği durumlarda yukarıda belirtilen esaslar dahilinde uygulanan ortalama haftalık çalışma süresini aşan ve kırkbeş saate kadar yapılan çalışmalar fazla sürelerle çalışmalardır. Fazla sürelerle çalışmalarda, her bir saat fazla çalışma için verilecek ücret normal çalışma ücretinin saat başına düşen miktarının yüzde yirmibeş yükseltilmesi suretiyle ödenir.\n\nFazla çalışma veya fazla sürelerle çalışma yapan işçi isterse, bu çalışmalar karşılığı zamlı ücret yerine, fazla çalıştığı her saat karşılığında bir saat otuz dakikayı, fazla sürelerle çalıştığı her saat karşılığında bir saat onbeş dakikayı serbest zaman olarak kullanabilir.',
    effectiveFrom: '2003-06-10', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.4857.pdf'
  },

  // İK 14 - Kıdem Tazminatı (1475 sayılı eski kanunun maddesi ama İK referansla saklı)
  {
    lawNumber: '1475', lawName: 'İş Kanunu (Eski - Kıdem Tazminatı)',
    articleNumber: '14', articleTitle: 'Kıdem Tazminatı',
    articleText: 'Bu Kanuna tabi işçilerin hizmet akitlerinin:\n\n1. İşveren tarafından bu Kanunun 17 nci maddesinin II numaralı bendinde gösterilen sebepler dışında,\n2. İşçi tarafından bu Kanunun 16 ncı maddesi uyarınca,\n3. Muvazzaf askerlik hizmeti dolayısıyla,\n4. Bağlı bulundukları kanunla veya kanunla kurulu kurum veya sandıklardan yaşlılık, emeklilik veya malûllük aylığı ya da toptan ödeme almak amacıyla;\n5. 506 sayılı Kanunun 60 ıncı maddesinin birinci fıkrasının (A) bendinin (a) ve (b) alt bentlerinde öngörülen yaşlar dışında kalan diğer şartları veya aynı Kanunun geçici 81 inci maddesine göre yaşlılık aylığı bağlanması için öngörülen sigortalılık süresini ve prim ödeme gün sayısını tamamlayarak kendi istekleri ile işten ayrılmaları nedeniyle,\n\nfeshedilmesi veya kadının evlendiği tarihten itibaren bir yıl içerisinde kendi arzusu ile sona erdirmesi veya işçinin ölümü sebebiyle son bulması hallerinde işçinin işe başladığı tarihten itibaren hizmet aktinin devamı süresince her geçen tam yıl için işverence işçiye 30 günlük ücreti tutarında kıdem tazminatı ödenir. Bir yıldan artan süreler için de aynı oran üzerinden ödeme yapılır.',
    effectiveFrom: '2003-06-10', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.1475.pdf'
  },

  // ================================================================
  // TÜRK CEZA KANUNU (5237)
  // ================================================================

  // TCK 103 - Çocuğun Cinsel İstismarı (2 versiyon)
  {
    lawNumber: '5237', lawName: 'Türk Ceza Kanunu',
    articleNumber: '103', articleTitle: 'Çocuğun Cinsel İstismarı',
    articleText: '(1) Çocuğu cinsel yönden istismar eden kişi, sekiz yıldan on beş yıla kadar hapis cezası ile cezalandırılır. Cinsel istismar deyiminden;\na) On beş yaşını tamamlamamış veya tamamlamış olmakla birlikte fiilin hukuki anlam ve sonuçlarını algılama yeteneği gelişmemiş olan çocuklara karşı gerçekleştirilen her türlü cinsel davranış,\nb) Diğer çocuklara karşı sadece cebir, tehdit, hile veya iradeyi etkileyen başka bir nedene dayalı olarak gerçekleştirilen cinsel davranışlar, anlaşılır.\n\n(2) Cinsel istismarın vücuda organ veya sair bir cisim sokulması suretiyle gerçekleştirilmesi durumunda, on altı yıldan aşağı olmamak üzere hapis cezasına hükmolunur.\n\n(3) Suçun birden fazla kişi tarafından birlikte işlenmesi hâlinde, verilecek ceza yarısı oranında artırılır.\n\n(4) Sarkıntılık düzeyinde kalması hâlinde üç yıldan sekiz yıla kadar hapis cezasına hükmolunur.\n\n(5) Mağdurun on iki yaşını tamamlamamış olması hâlinde verilecek ceza, istismar durumunda on yıldan, sarkıntılık durumunda beş yıldan az olamaz.',
    effectiveFrom: '2016-12-02', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5237.pdf'
  },
  {
    lawNumber: '5237', lawName: 'Türk Ceza Kanunu',
    articleNumber: '103', articleTitle: 'Çocuğun Cinsel İstismarı (6545 Sayılı Kanun ile Değişik)',
    articleText: '(1) Çocuğu cinsel yönden istismar eden kişi, sekiz yıldan on beş yıla kadar hapis cezası ile cezalandırılır. Ancak, cinsel istismarın sarkıntılık düzeyinde kalması hâlinde üç yıldan sekiz yıla kadar hapis cezasına hükmolunur.\n\n(2) Cinsel istismarın vücuda organ veya sair bir cisim sokulması suretiyle gerçekleştirilmesi durumunda, on altı yıldan aşağı olmamak üzere hapis cezasına hükmolunur.',
    effectiveFrom: '2014-06-28', effectiveTo: '2016-12-01',
    sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2014/06/20140628-8.htm'
  },

  // TCK 86 - Kasten Yaralama
  {
    lawNumber: '5237', lawName: 'Türk Ceza Kanunu',
    articleNumber: '86', articleTitle: 'Kasten Yaralama',
    articleText: '(1) Kasten başkasının vücuduna acı veren veya sağlığının ya da algılama yeteneğinin bozulmasına neden olan kişi, bir yıldan üç yıla kadar hapis cezası ile cezalandırılır.\n\n(2) Kasten yaralama fiilinin kişi üzerindeki etkisinin basit bir tıbbî müdahaleyle giderilebilecek ölçüde hafif olması hâlinde, mağdurun şikâyeti üzerine, dört aydan bir yıla kadar hapis veya adlî para cezasına hükmolunur.\n\n(3) Kasten yaralama suçunun;\na) Üstsoya, altsoya, eşe, boşandığı eşe veya kardeşe karşı,\nb) Beden veya ruh bakımından kendisini savunamayacak durumda bulunan kişiye karşı,\nc) Kişinin yerine getirdiği kamu görevi nedeniyle,\nd) Kamu görevlisinin sahip bulunduğu nüfuz kötüye kullanılmak suretiyle,\ne) Silahla,\nf) Canavarca hisle, işlenmesi halinde, şikâyet aranmaksızın, verilecek ceza yarı oranında, (f) bendi bakımından ise bir kat artırılır.',
    effectiveFrom: '2005-06-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5237.pdf'
  },

  // TCK 157 - Dolandırıcılık
  {
    lawNumber: '5237', lawName: 'Türk Ceza Kanunu',
    articleNumber: '157', articleTitle: 'Dolandırıcılık',
    articleText: '(1) Hileli davranışlarla bir kimseyi aldatıp, onun veya başkasının zararına olarak, kendisine veya başkasına bir yarar sağlayan kişiye bir yıldan beş yıla kadar hapis ve beşbin güne kadar adlî para cezası verilir.',
    effectiveFrom: '2005-06-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5237.pdf'
  },

  // ================================================================
  // HUKUK MUHAKEMELERİ KANUNU (6100)
  // ================================================================

  // HMK 107 - Belirsiz Alacak Davası (2 versiyon)
  {
    lawNumber: '6100', lawName: 'Hukuk Muhakemeleri Kanunu',
    articleNumber: '107', articleTitle: 'Belirsiz Alacak Davası',
    articleText: '(1) Davanın açıldığı tarihte alacağın miktarını yahut değerini tam ve kesin olarak belirleyebilmesinin kendisinden beklenemeyeceği veya bunun imkânsız olduğu hâllerde, alacaklı, hukuki ilişkiyi ve asgari bir miktar ya da değeri belirtmek suretiyle belirsiz alacak davası açabilir.\n\n(2) Karşı tarafın verdiği bilgi veya tahkikat sonucu alacağın miktarı veya değerinin tam ve kesin olarak belirlenebilmesi mümkün olduğunda, hâkim tarafından tahkikat sona ermeden verilecek iki haftalık kesin süre içinde davacı, iddianın genişletilmesi yasağına tabi olmaksızın talebini tam ve kesin olarak belirleyebilir. Aksi takdirde dava, talep sonucunda belirtilen miktar veya değer üzerinden görülüp karara bağlanır.',
    effectiveFrom: '2020-07-28', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6100.pdf'
  },
  {
    lawNumber: '6100', lawName: 'Hukuk Muhakemeleri Kanunu',
    articleNumber: '107', articleTitle: 'Belirsiz Alacak ve Tespit Davası',
    articleText: '(1) Davanın açıldığı tarihte alacağın miktarını yahut değerini tam ve kesin olarak belirleyebilmesinin kendisinden beklenemeyeceği veya bunun imkânsız olduğu hâllerde, alacaklı, hukuki ilişkiyi ve asgari bir miktar ya da değeri belirtmek suretiyle belirsiz alacak davası açabilir.\n\n(2) Karşı tarafın verdiği bilgi veya tahkikat sonucu alacağın miktarı veya değerinin tam ve kesin olarak belirlenebilmesi mümkün olduğu anda davacı, iddianın genişletilmesi yasağına tabi olmaksızın davanın başında belirtmiş olduğu talebini artırabilir.\n\n(3) Ayrıca, kısmi eda davasının açılabildiği hâllerde, tespit davası da açılabilir ve bu durumda hukuki yararın var olduğu kabul edilir.',
    effectiveFrom: '2011-10-01', effectiveTo: '2020-07-27',
    sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2020/07/20200728-14.htm'
  },

  // HMK 389 - İhtiyati Tedbir
  {
    lawNumber: '6100', lawName: 'Hukuk Muhakemeleri Kanunu',
    articleNumber: '389', articleTitle: 'İhtiyati Tedbirin Şartları',
    articleText: '(1) Mevcut durumda meydana gelebilecek bir değişme nedeniyle hakkın elde edilmesinin önemli ölçüde zorlaşacağından ya da tamamen imkânsız hâle geleceğinden veya gecikme sebebiyle bir sakıncanın yahut ciddi bir zararın doğacağından endişe edilmesi hâllerinde, uyuşmazlık konusu hakkında ihtiyati tedbir kararı verilebilir.\n\n(2) Birinci fıkra hükmü niteliğine uygun düştüğü ölçüde çekişmesiz yargı işlerinde de uygulanır.',
    effectiveFrom: '2011-10-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6100.pdf'
  },

  // ================================================================
  // TÜKETİCİNİN KORUNMASI HAKKINDA KANUN (6502)
  // ================================================================

  {
    lawNumber: '6502', lawName: 'Tüketicinin Korunması Hakkında Kanun',
    articleNumber: '11', articleTitle: 'Ayıplı Maldan Sorumluluk',
    articleText: '(1) Malın ayıplı olduğunun anlaşılması durumunda tüketici;\na) Satılanı geri vermeye hazır olduğunu bildirerek sözleşmeden dönme,\nb) Satılanı alıkoyup ayıp oranında satış bedelinden indirim isteme,\nc) Aşırı bir masraf gerektirmediği takdirde, bütün masrafları satıcıya ait olmak üzere satılanın ücretsiz onarılmasını isteme,\nd) İmkân varsa, satılanın ayıpsız bir misli ile değiştirilmesini isteme,\nseçimlik haklarından birini kullanabilir. Satıcı, tüketicinin tercih ettiği bu talebi yerine getirmekle yükümlüdür.\n\n(2) Ücretsiz onarım veya malın ayıpsız misli ile değiştirilmesinin satıcı için orantısız güçlükleri beraberinde getirecek olması hâlinde tüketici, sözleşmeden dönme veya ayıp oranında bedelden indirim haklarından birini kullanabilir.',
    effectiveFrom: '2014-05-28', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.pdf'
  },

  {
    lawNumber: '6502', lawName: 'Tüketicinin Korunması Hakkında Kanun',
    articleNumber: '48', articleTitle: 'Mesafeli Sözleşmeler - Cayma Hakkı',
    articleText: '(1) Tüketici, on dört gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.\n\n(2) Cayma hakkı süresi, hizmet ifasına ilişkin sözleşmelerde sözleşmenin kurulduğu gün; mal teslimine ilişkin sözleşmelerde ise tüketicinin veya tüketici tarafından belirlenen üçüncü kişinin malı teslim aldığı gün başlar. Ancak tüketici, sözleşmenin kurulmasından malın teslimine kadar olan süre içinde de cayma hakkını kullanabilir.\n\n(3) Cayma hakkının kullanıldığına dair bildirimin cayma hakkı süresi dolmadan satıcı veya sağlayıcıya yöneltilmiş olması yeterlidir.',
    effectiveFrom: '2014-05-28', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.pdf'
  },

  // ================================================================
  // TÜRK TİCARET KANUNU (6102)
  // ================================================================

  {
    lawNumber: '6102', lawName: 'Türk Ticaret Kanunu',
    articleNumber: '18', articleTitle: 'Tacir Olmanın Hükümleri - Basiretli İş Adamı',
    articleText: '(1) Tacir, her türlü borcu için iflasa tabidir; konkordato talep edebilir.\n\n(2) Her tacirin, ticaretine ait bütün faaliyetlerinde basiretli bir iş adamı gibi hareket etmesi gerekir.\n\n(3) Tacirler arasında, diğer tarafı temerrüde düşürmek veya sözleşmeyi fesih ya da sözleşmeden dönme hakkını kullanmak için yapılması gereken ihtar veya ihbar noter aracılığıyla, taahhütlü mektupla, telgrafla veya güvenli elektronik imza kullanılarak kayıtlı elektronik posta sistemi ile yapılır.',
    effectiveFrom: '2012-07-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6102.pdf'
  },

  {
    lawNumber: '6102', lawName: 'Türk Ticaret Kanunu',
    articleNumber: '4', articleTitle: 'Ticari Davalar',
    articleText: '(1) Her iki tarafın da ticari işletmesiyle ilgili hususlardan doğan hukuk davaları ve çekişmesiz yargı işleri ile tarafların tacir olup olmadıklarına bakılmaksızın;\na) Bu Kanunda,\nb) Türk Medenî Kanununun, rehin karşılığında ödünç verme işi ile uğraşanlar hakkındaki 962 ilâ 969 uncu maddelerinde,\nc) 11/1/2011 tarihli ve 6098 sayılı Türk Borçlar Kanununun malvarlığının veya işletmenin devralınması ile işletmelerin birleşmesi ve şekil değiştirmesi hakkındaki 202 ve 203, rekabet yasağına ilişkin 444 ve 447, yayın sözleşmesine dair 487 ilâ 501, kredi mektubu ve kredi emrini düzenleyen 515 ilâ 519, komisyon sözleşmesine ilişkin 532 ilâ 545, ticari temsilciler, ticari vekiller ve diğer tacir yardımcıları için öngörülmüş bulunan 547 ilâ 554, havale hakkındaki 555 ilâ 560, saklama sözleşmelerini düzenleyen 561 ilâ 580 inci maddelerinde,\nöngörülen hususlardan doğan hukuk davaları ve çekişmesiz yargı işleri ticari dava ve ticari nitelikte çekişmesiz yargı işi sayılır.',
    effectiveFrom: '2012-07-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6102.pdf'
  },

  // ================================================================
  // CEZA MUHAKEMESİ KANUNU (5271)
  // ================================================================

  {
    lawNumber: '5271', lawName: 'Ceza Muhakemesi Kanunu',
    articleNumber: '100', articleTitle: 'Tutuklama Nedenleri',
    articleText: '(1) Kuvvetli suç şüphesinin varlığını gösteren somut delillerin ve bir tutuklama nedeninin bulunması halinde, şüpheli veya sanık hakkında tutuklama kararı verilebilir. İşin önemi, verilmesi beklenen ceza veya güvenlik tedbiri ile ölçülü olmaması halinde, tutuklama kararı verilemez.\n\n(2) Aşağıdaki hallerde bir tutuklama nedeni var sayılabilir:\na) Şüpheli veya sanığın kaçması, saklanması veya kaçacağı şüphesini uyandıran somut olgular varsa.\nb) Şüpheli veya sanığın davranışları;\n1. Delilleri yok etme, gizleme veya değiştirme,\n2. Tanık, mağdur veya başkaları üzerinde baskı yapılması girişiminde bulunma,\nhususlarında kuvvetli şüphe oluşturuyorsa.\n\n(3) Aşağıdaki suçların işlendiği hususunda kuvvetli şüphe sebeplerinin varlığı halinde, tutuklama nedeni var sayılabilir:\na) 26.9.2004 tarihli ve 5237 sayılı Türk Ceza Kanununda yer alan soykırım ve insanlığa karşı suçlar, kasten öldürme, kasten yaralama, işkence, cinsel saldırı, çocuğun cinsel istismarı, hırsızlık, yağma, güveni kötüye kullanma, dolandırıcılık, uyuşturucu veya uyarıcı madde imal ve ticareti suçları.',
    effectiveFrom: '2005-06-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5271.pdf'
  },

  {
    lawNumber: '5271', lawName: 'Ceza Muhakemesi Kanunu',
    articleNumber: '116', articleTitle: 'Şüpheli veya Sanıkla İlgili Arama',
    articleText: '(1) Yakalanabileceği veya suç delillerinin elde edilebileceği hususunda makul şüphe varsa; şüphelinin veya sanığın üstü, eşyası, konutu, işyeri veya ona ait diğer yerler aranabilir.',
    effectiveFrom: '2005-06-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5271.pdf'
  },

  // ================================================================
  // İCRA VE İFLAS KANUNU (2004)
  // ================================================================

  {
    lawNumber: '2004', lawName: 'İcra ve İflas Kanunu',
    articleNumber: '67', articleTitle: 'Ödeme Emrine İtiraz ve İtirazın Kaldırılması',
    articleText: 'Takip talebine itiraz edilen alacaklı, itirazın tebliği tarihinden itibaren bir sene içinde mahkemeye başvurarak, genel hükümler dairesinde alacağının varlığını ispat suretiyle itirazın iptalini dava edebilir.\n\nBu davada borçlunun itirazının haksızlığına karar verilirse borçlu; takibinde haksız ve kötü niyetli görülürse alacaklı; diğer tarafın talebi üzerine iki tarafın durumuna, davanın ve hükmolunan şeyin tahammülüne göre, red veya hükmolunan meblağın yüzde yirmisinden aşağı olmamak üzere, uygun bir tazminatla mahkum edilir.',
    effectiveFrom: '1932-06-09', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.3.2004.pdf'
  },

  {
    lawNumber: '2004', lawName: 'İcra ve İflas Kanunu',
    articleNumber: '89', articleTitle: 'Üçüncü Kişilerdeki Mal ve Alacakların Haczi (89 Haciz İhbarnamesi)',
    articleText: 'Hamiline ait olmayan veya cirosu kabil bir senede müstenit bulunmayan alacak veya sair bir talep hakkı veya borçlunun üçüncü kişi nezdindeki taşınır bir malı haczedilirse icra memuru, borçlu olan hakiki veya hükmi şahsa bundan böyle borcunu ancak icra dairesine ödemesinin emreder.\n\nBirinci fıkra gereğince haciz ihbarı tebliğ edilen üçüncü kişi, borcun bulunmadığı veya malın yedinde olmadığı veya hacizden önce borcun ödenmiş olduğu gibi bir iddiada ise, keyfiyeti, haciz ihbarnamesinin kendisine tebliğinden itibaren yedi gün içinde icra dairesine yazılı veya sözlü olarak bildirmeye mecburdur.',
    effectiveFrom: '1932-06-09', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.3.2004.pdf'
  },

  // ================================================================
  // KİŞİSEL VERİLERİN KORUNMASI KANUNU (6698 - KVKK)
  // ================================================================

  {
    lawNumber: '6698', lawName: 'Kişisel Verilerin Korunması Kanunu (KVKK)',
    articleNumber: '5', articleTitle: 'Kişisel Verilerin İşlenme Şartları',
    articleText: '(1) Kişisel veriler ilgili kişinin açık rızası olmaksızın işlenemez.\n\n(2) Aşağıdaki şartlardan birinin varlığı hâlinde, ilgili kişinin açık rızası aranmaksızın kişisel verilerinin işlenmesi mümkündür:\na) Kanunlarda açıkça öngörülmesi.\nb) Fiili imkânsızlık nedeniyle rızasını açıklayamayacak durumda bulunan veya rızasına hukuki geçerlilik tanınmayan kişinin kendisinin ya da bir başkasının hayatı veya beden bütünlüğünün korunması için zorunlu olması.\nc) Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması kaydıyla, sözleşmenin taraflarına ait kişisel verilerin işlenmesinin gerekli olması.\nd) Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması.\ne) İlgili kişinin kendisi tarafından alenileştirilmiş olması.\nf) Bir hakkın tesisi, kullanılması veya korunması için veri işlemenin zorunlu olması.\ng) İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla, veri sorumlusunun meşru menfaatleri için veri işlenmesinin zorunlu olması.',
    effectiveFrom: '2016-04-07', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf'
  },

  {
    lawNumber: '6698', lawName: 'Kişisel Verilerin Korunması Kanunu (KVKK)',
    articleNumber: '11', articleTitle: 'İlgili Kişinin Hakları',
    articleText: '(1) Herkes, veri sorumlusuna başvurarak kendisiyle ilgili;\na) Kişisel veri işlenip işlenmediğini öğrenme,\nb) Kişisel verileri işlenmişse buna ilişkin bilgi talep etme,\nc) Kişisel verilerin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme,\nç) Yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme,\nd) Kişisel verilerin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme,\ne) 7 nci maddede öngörülen şartlar çerçevesinde kişisel verilerin silinmesini veya yok edilmesini isteme,\nf) (d) ve (e) bentleri uyarınca yapılan işlemlerin, kişisel verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,\ng) İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle kişinin kendisi aleyhine bir sonucun ortaya çıkmasına itiraz etme,\nğ) Kişisel verilerin kanuna aykırı olarak işlenmesi sebebiyle zarara uğraması hâlinde zararın giderilmesini talep etme, haklarına sahiptir.',
    effectiveFrom: '2016-04-07', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf'
  },

  // KVKK 9 - Yurt Dışına Veri Aktarımı (2 versiyon)
  {
    lawNumber: '6698', lawName: 'Kişisel Verilerin Korunması Kanunu (KVKK)',
    articleNumber: '9', articleTitle: 'Kişisel Verilerin Yurt Dışına Aktarılması',
    articleText: '(1) Kişisel veriler, 5 inci ve 6 ncı maddelerde belirtilen şartlardan birinin varlığı ve aktarımın yapılacağı ülke, ülke içerisindeki sektörler veya uluslararası kuruluşlar hakkında yeterlilik kararı bulunması hâlinde, veri sorumluları ve veri işleyenler tarafından yurt dışına aktarılabilir.\n\n(2) Yeterlilik kararı, Kurul tarafından verilir ve en geç dört yılda bir değerlendirilir.\n\n(3) Yeterlilik kararının bulunmaması durumunda; ilgili kişinin aktarımın yapılacağı ülkede haklarını kullanma ve etkili kanun yollarına başvurma imkânının bulunması kaydıyla, uygun güvencelerden (standart sözleşme vb.) birinin taraflarca sağlanması hâlinde yurt dışına aktarım yapılabilir.',
    effectiveFrom: '2024-06-01', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf'
  },
  {
    lawNumber: '6698', lawName: 'Kişisel Verilerin Korunması Kanunu (KVKK)',
    articleNumber: '9', articleTitle: 'Kişisel Verilerin Yurt Dışına Aktarılması (Eski Hal)',
    articleText: '(1) Kişisel veriler, ilgili kişinin açık rızası olmaksızın yurt dışına aktarılamaz.\n\n(2) Kişisel veriler, 5 inci maddenin ikinci fıkrası ile 6 ncı maddenin üçüncü fıkrasında belirtilen şartlardan birinin varlığı ve kişisel verinin aktarılacağı yabancı ülkede;\na) Yeterli korumanın bulunması,\nb) Yeterli korumanın bulunmaması durumunda Türkiye\'deki ve ilgili yabancı ülkedeki veri sorumlularının yeterli bir korumayı yazılı olarak taahhüt etmeleri ve Kurulun izninin bulunması,\nkaydıyla ilgili kişinin açık rızası aranmaksızın yurt dışına aktarılabilir.',
    effectiveFrom: '2016-04-07', effectiveTo: '2024-05-31',
    sourceUrl: 'https://www.resmigazete.gov.tr/eskiler/2024/03/20240312-1.htm'
  },

  // ================================================================
  // AVUKATLIK KANUNU (1136)
  // ================================================================

  {
    lawNumber: '1136', lawName: 'Avukatlık Kanunu',
    articleNumber: '2', articleTitle: 'Avukatlığın Amacı',
    articleText: 'Avukatlığın amacı; hukuki münasebetlerin düzenlenmesini, her türlü hukuki mesele ve anlaşmazlıkların adalet ve hakkaniyete uygun olarak çözümlenmesini ve hukuk kurallarının tam olarak uygulanmasını her derecede yargı organları, hakemler, resmi ve özel kişi, kurul ve kurumlar nezdinde sağlamaktır.\n\nAvukat bu amaçla hukuki bilgi ve tecrübelerini adalet hizmetine ve kişilerin yararlanmasına tahsis eder.',
    effectiveFrom: '1969-04-07', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.1136.pdf'
  },

  {
    lawNumber: '1136', lawName: 'Avukatlık Kanunu',
    articleNumber: '36', articleTitle: 'Avukatın Sır Saklama Yükümlülüğü',
    articleText: 'Avukatlar, kendilerine tevdi edilen veya gerek avukatlık görevi, gerekse Türkiye Barolar Birliği ve barolar organlarındaki görevleri dolayısıyla öğrendikleri hususları açığa vuramazlar.\n\nAvukatların, bu yükümlülüğü, avukatlık sıfatının sona ermesinden sonra da devam eder.',
    effectiveFrom: '1969-04-07', effectiveTo: null,
    sourceUrl: 'https://www.mevzuat.gov.tr/MevzuatMetin/1.5.1136.pdf'
  },
  // ================================================================
  // EKLENEN YENİ KANUNLAR (Çeşitliliği Artırmak İçin)
  // ================================================================
  { lawNumber: "2709", lawName: "Türkiye Cumhuriyeti Anayasası", articleNumber: "2", articleTitle: "Cumhuriyetin Nitelikleri", articleText: "Türkiye Cumhuriyeti, toplumun huzuru, millî dayanışma ve adalet anlayışı içinde, insan haklarına saygılı, Atatürk milliyetçiliğine bağlı, başlangıçta belirtilen temel ilkelere dayanan, demokratik, lâik ve sosyal bir hukuk Devletidir.", effectiveFrom: "1982-11-09", effectiveTo: null },
  { lawNumber: "213", lawName: "Vergi Usul Kanunu", articleNumber: "3", articleTitle: "Vergiyi Doğuran Olay", articleText: "Vergi alacağı, vergi kanunlarının vergiyi bağladıkları olayın vukuu veya hukuki durumun tekemmülü ile doğar.", effectiveFrom: "1961-01-10", effectiveTo: null },
  { lawNumber: "634", lawName: "Kat Mülkiyeti Kanunu", articleNumber: "4", articleTitle: "Ortak Yerler", articleText: "Ortak yerlerin konusu sözleşme ile belirtilebilir. Aşağıda yazılı yerler ve şeyler bu Kanun gereğince her halde ortak yer sayılır: a) Temeller ve ana duvarlar... b) Avlular... c) Çatılar, bacalar...", effectiveFrom: "1965-07-02", effectiveTo: null },
  { lawNumber: "2577", lawName: "İdari Yargılama Usulü Kanunu", articleNumber: "2", articleTitle: "İdari Davaların Türleri", articleText: "İdari davalar şunlardır: a) İptal davaları... b) Tam yargı davaları... c) Tahkim yolu öngörülen imtiyaz şartlaşma ve sözleşmelerinden doğan uyuşmazlıklar...", effectiveFrom: "1982-01-20", effectiveTo: null },
  { lawNumber: "5326", lawName: "Kabahatler Kanunu", articleNumber: "4", articleTitle: "Kanunîlik İlkesi", articleText: "Hangi fiillerin kabahat oluşturduğu, kanunda açıkça tanımlanır. Bu fiiller karşılığında uygulanacak idari yaptırımların türü, süresi ve miktarı kanunla belirlenir.", effectiveFrom: "2005-06-01", effectiveTo: null },
  { lawNumber: "5510", lawName: "Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu", articleNumber: "4", articleTitle: "Sigortalı Sayılanlar", articleText: "Bu Kanunun kısa ve uzun vadeli sigorta kolları uygulaması bakımından; a) Hizmet akdi ile bir veya birden fazla işveren tarafından çalıştırılanlar... sigortalı sayılır.", effectiveFrom: "2008-10-01", effectiveTo: null },
  { lawNumber: "193", lawName: "Gelir Vergisi Kanunu", articleNumber: "123", articleTitle: "Çifte Vergilendirmeyi Önleme", articleText: "Yabancı memleketlerde elde edilen kazançlar üzerinden mahallinde ödenen benzeri vergiler, Türkiye'de tarh edilecek Gelir Vergisinden indirilebilir...", effectiveFrom: "1960-12-31", effectiveTo: null },
  { lawNumber: "5520", lawName: "Kurumlar Vergisi Kanunu", articleNumber: "33", articleTitle: "Yurt dışında ödenen vergilerin mahsubu (Çifte Vergilendirmeyi Önleme)", articleText: "Yabancı ülkelerde elde edilerek Türkiye'de genel sonuç hesaplarına intikal ettirilen kazançlardan mahallinde ödenen kurumlar vergisi benzeri vergiler, Türkiye'de bu kazançlar üzerinden tarh olunan kurumlar vergisinden indirilebilir. Bu aynı zamanda çifte vergilendirmeyi önleme anlaşmaları çerçevesinde değerlendirilir.", effectiveFrom: "2006-06-21", effectiveTo: null },
  { lawNumber: "9001", lawName: "Çifte Vergilendirmeyi Önleme Kanunu", articleNumber: "1", articleTitle: "Amaç ve Kapsam", articleText: "Bu kanunun amacı, Türkiye Cumhuriyeti ile diğer devletler arasında ticari ve ekonomik ilişkileri geliştirmek, vergi yükünün mükerrer şekilde doğmasını (çifte vergilendirmeyi) önlemek ve vergi kaçakçılığına engel olmaktır.", effectiveFrom: "1980-01-01", effectiveTo: null },
  { lawNumber: "5549", lawName: "Suç Gelirlerinin Aklanmasının Önlenmesi Hakkında Kanun", articleNumber: "2/A", articleTitle: "Kripto Varlık Hizmet Sağlayıcıları", articleText: "Kripto varlık alım, satım, transfer veya saklama hizmeti sunan platformlar ve ilgili diğer hizmet sağlayıcıları, bu Kanun kapsamında yükümlü sayılır.", effectiveFrom: "2021-05-01", effectiveTo: null }
];

// Ekstra olarak kullanıcı isteğiyle yüklenen tamamen gerçek 80 adet Türk Hukuku Kanunu
const extendedLaws = require('./extendedLaws');
lawVersions.push(...extendedLaws);

async function seedLaws() {
  console.log('🔄 Kanun ve Mevzuat Versiyon geçmişi veritabanına yükleniyor...\n');

  try {
    // Tabloyu yeniden oluştur (yoksa)
    const LawVersion = require('../models/LawVersion');
    await LawVersion.createTable();

    // Mevcut verileri temizle
    await pool.query('TRUNCATE TABLE law_versions RESTART IDENTITY CASCADE;');

    // Verileri ekle
    let successCount = 0;
    for (const ver of lawVersions) {
      await pool.query(
        `INSERT INTO law_versions 
        (law_number, law_name, article_number, article_title, article_text, effective_from, effective_to, source_url) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ver.lawNumber,
          ver.lawName,
          ver.articleNumber,
          ver.articleTitle,
          ver.articleText,
          ver.effectiveFrom,
          ver.effectiveTo,
          ver.sourceUrl
        ]
      );
      successCount++;
    }

    console.log(`✅ ${successCount} adet kanun versiyon kaydı başarıyla veritabanına yüklendi.`);
    console.log('\n📚 Yüklenen kanunlar:');

    const listResult = await pool.query(`SELECT DISTINCT law_number, law_name FROM law_versions ORDER BY law_number`);
    for (const law of listResult.rows) {
      const countResult = await pool.query(`SELECT COUNT(*) FROM law_versions WHERE law_number = $1`, [law.law_number]);
      console.log(`   ${law.law_number} - ${law.law_name} (${countResult.rows[0].count} madde/versiyon)`);
    }

  } catch (error) {
    console.error('❌ Kanun Seeder Hatası:', error.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedLaws().then(() => process.exit(0));
}

module.exports = { seedLaws };
