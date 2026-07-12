/**
 * Seed Chinese -> Spanish/English B1 and B2 curricula.
 * Keeps all existing levels and questions, and replaces only the four seeded courses.
 * Run: node content-studio/scripts/seed-es-en-b1-b2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = name => JSON.parse(readFileSync(resolve(ROOT, 'data', name), 'utf8'))
const write = (name, value) => writeFileSync(resolve(ROOT, 'data', name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')

const P = (target, zh) => ({ target, zh })
const S = (native, target, grammar, scenario, example, translation, words) => ({
  native, target, grammar, scenario, example, translation,
  words: words.split(';').map(item => {
    const [targetWord, zhWord] = item.split('|')
    return P(targetWord, zhWord)
  })
})
const U = (native, target, goal, targetGoal, sections) => ({ native, target, goal, targetGoal, sections })

const courses = [
  {
    pairId: 'zh-es', language: 'es', languageName: 'Espanol', level: 'B1',
    units: [
      U('叙述经历与人生变化', 'Experiencias y cambios de vida', '连贯叙述过去经历并说明它们对现在的影响', 'Narrar experiencias pasadas y explicar su influencia en el presente', [
        S('连接过去事件', 'Conectar acontecimientos pasados', 'pretérito indefinido 与 imperfecto 的对比及时间连接词', '讲述一次旅行中连续发生的事件', 'Mientras esperaba el tren, conocí a una viajera que me recomendó visitar Toledo.', '等火车时，我认识了一位建议我游览托莱多的旅行者。', 'mientras|当……时;de repente|突然;ocurrir|发生;recordar|回忆;viajero|旅行者'),
        S('生活阶段与习惯', 'Etapas y hábitos de vida', 'solía + infinitivo 与 ya no / todavía', '比较童年习惯和现在的生活', 'De pequeño solía jugar en la calle, pero ahora ya no tengo tanto tiempo libre.', '小时候我常在街上玩，但现在没有那么多空闲时间了。', 'soler|惯常;infancia|童年;costumbre|习惯;etapa|阶段;mudarse|搬家'),
        S('成就与未完成经历', 'Logros y experiencias pendientes', 'pretérito perfecto 与 todavía no / ya', '谈论已经取得和尚未取得的成就', 'Ya he terminado el curso, aunque todavía no he recibido el certificado.', '我已经完成课程，不过还没有收到证书。', 'logro|成就;certificado|证书;superar|克服;alcanzar|达到;pendiente|待完成的'),
        S('讲述意外与反应', 'Imprevistos y reacciones', '过去时组合、原因与结果连接词', '叙述计划外事件以及自己的处理方式', 'Perdimos el vuelo por un atasco; por eso tuvimos que cambiar todos nuestros planes.', '我们因堵车误了航班，所以不得不改变所有计划。', 'imprevisto|意外;atasco|堵车;perder|错过;reaccionar|反应;resolver|解决')
      ]),
      U('观点表达与日常讨论', 'Opiniones y debates cotidianos', '清楚表达观点、赞同与反对并给出理由', 'Expresar opiniones, acuerdos y desacuerdos con razones claras', [
        S('提出个人观点', 'Presentar una opinión personal', 'creo que / desde mi punto de vista + indicativo', '讨论远程办公的利弊', 'Desde mi punto de vista, trabajar desde casa permite organizar mejor el tiempo.', '在我看来，在家工作可以更好地安排时间。', 'opinión|观点;ventaja|优点;desventaja|缺点;considerar|认为;permitir|允许'),
        S('礼貌赞同与反对', 'Acordar y discrepar con cortesía', 'estar de acuerdo、sin embargo、en cambio', '在小组讨论中回应不同意见', 'Entiendo tu argumento; sin embargo, no estoy de acuerdo con esa conclusión.', '我理解你的论点，不过我不同意这个结论。', 'acuerdo|赞同;desacuerdo|反对;argumento|论点;conclusión|结论;respetar|尊重'),
        S('解释原因与后果', 'Explicar causas y consecuencias', 'porque / debido a / por lo tanto', '分析社交媒体使用习惯', 'Muchas personas reducen las notificaciones debido a que interrumpen su concentración.', '许多人减少通知，因为通知会打断注意力。', 'causa|原因;consecuencia|后果;debido a|由于;interrumpir|打断;concentración|注意力'),
        S('比较选择', 'Comparar alternativas', '比较级、lo mejor / lo peor、por un lado...por otro', '比较城市生活和乡村生活', 'Por un lado, la ciudad ofrece más servicios; por otro, el campo es más tranquilo.', '一方面城市提供更多服务，另一方面乡村更安静。', 'alternativa|选择;servicio|服务;entorno|环境;tranquilo|安静的;comparar|比较')
      ]),
      U('工作、学习与职业发展', 'Trabajo, estudios y desarrollo profesional', '处理常见职场学习沟通并讨论职业计划', 'Comunicarse en contextos laborales y académicos y hablar de planes profesionales', [
        S('求职与能力介绍', 'Búsqueda de empleo y competencias', '过去经历、能力表达及 para + infinitivo', '在面试中介绍经验和优势', 'Tengo experiencia en atención al cliente y capacidad para resolver problemas bajo presión.', '我有客户服务经验，也能在压力下解决问题。', 'currículum|简历;entrevista|面试;experiencia|经验;competencia|能力;candidato|候选人'),
        S('会议与任务协调', 'Reuniones y coordinación de tareas', '命令式、tener que、hay que', '分配任务并确认截止时间', 'Tenemos que entregar el informe el viernes, así que repartiré las tareas hoy.', '我们必须周五提交报告，因此我今天会分配任务。', 'reunión|会议;plazo|截止期;tarea|任务;entregar|提交;coordinar|协调'),
        S('学习策略', 'Estrategias de aprendizaje', '条件句 si + presente、建议结构', '讨论提高语言能力的方法', 'Si practicas un poco cada día, recordarás el vocabulario con más facilidad.', '如果每天练习一点，你会更容易记住词汇。', 'estrategia|策略;repasar|复习;progreso|进步;objetivo|目标;constancia|坚持'),
        S('职业规划', 'Planes profesionales', '将来时与 ir a、希望和打算', '说明未来几年的职业目标', 'Dentro de dos años me gustaría asumir más responsabilidades y dirigir un equipo.', '两年后我希望承担更多责任并带领团队。', 'carrera|职业生涯;ascenso|晋升;responsabilidad|责任;dirigir|领导;formación|培训')
      ]),
      U('健康、生活方式与建议', 'Salud, estilo de vida y consejos', '描述健康问题、理解建议并讨论健康习惯', 'Describir problemas de salud, entender consejos y debatir hábitos saludables', [
        S('描述症状变化', 'Describir la evolución de síntomas', 'desde hace、llevar + gerundio', '向医生说明症状持续时间', 'Llevo tres días sintiéndome cansado y desde ayer también me duele la garganta.', '我已经疲倦三天了，从昨天起喉咙也疼。', 'síntoma|症状;mareo|眩晕;dolor|疼痛;mejorar|好转;empeorar|恶化'),
        S('给出建议', 'Dar consejos', 'deberías、te recomiendo que + subjuntivo', '建议朋友调整作息', 'Te recomiendo que descanses más y que evites usar el móvil antes de dormir.', '我建议你多休息，并避免睡前使用手机。', 'aconsejar|建议;descanso|休息;evitar|避免;hábito|习惯;bienestar|健康'),
        S('饮食与运动', 'Alimentación y ejercicio', '数量表达、频率与目的', '制定可持续的健康计划', 'Una dieta equilibrada no exige dejar todo lo que te gusta, sino controlar las cantidades.', '均衡饮食并不要求放弃所有喜欢的食物，而是控制食量。', 'equilibrado|均衡的;nutriente|营养素;ración|份量;entrenamiento|训练;resistencia|耐力'),
        S('压力管理', 'Gestión del estrés', '情感表达与 cuando + subjuntivo', '交流应对工作压力的方法', 'Cuando me sienta agobiado, haré una pausa breve para recuperar la concentración.', '当我感到不堪重负时，我会短暂休息以恢复专注。', 'estrés|压力;agobiado|不堪重负的;pausa|暂停;respirar|呼吸;recuperar|恢复')
      ]),
      U('旅行、公共服务与问题处理', 'Viajes, servicios y resolución de problemas', '在旅行和公共服务场景中获取信息并解决问题', 'Obtener información y resolver problemas en viajes y servicios públicos', [
        S('预订与条件确认', 'Reservas y condiciones', '间接疑问句与条件表达', '预订住宿并确认取消条款', 'Quisiera saber si la reserva incluye el desayuno y si se puede cancelar sin coste.', '我想知道预订是否含早餐，以及能否免费取消。', 'reserva|预订;alojamiento|住宿;incluido|包含的;cancelar|取消;condición|条件'),
        S('投诉与解决方案', 'Quejas y soluciones', '礼貌请求、条件式 quisiera / podrían', '就服务问题提出投诉', 'La habitación no coincide con la descripción; ¿podrían ofrecernos una solución?', '房间与描述不符，你们能否给我们一个解决方案？', 'queja|投诉;coincidir|相符;reembolso|退款;avería|故障;solución|解决方案'),
        S('问路与公共信息', 'Orientación e información pública', '间接宾语、关系从句与方位表达', '询问公共交通换乘路线', '¿Podría indicarme dónde se toma el autobús que va al centro histórico?', '您能告诉我去历史中心的公交车在哪里乘坐吗？', 'transbordo|换乘;andén|站台;trayecto|路线;indicar|指示;destino|目的地'),
        S('旅行故事与建议', 'Relatos y recomendaciones de viaje', '叙事时态与建议结构', '分享一次旅行并给出实用建议', 'El pueblo que visitamos era precioso, pero conviene reservar alojamiento con antelación.', '我们游览的小镇很美，不过最好提前预订住宿。', 'antelación|提前;recorrido|行程;paisaje|风景;recomendar|推荐;descubrir|发现')
      ]),
      U('媒体、文化与社会生活', 'Medios, cultura y vida social', '理解媒体文化内容并参与社会话题交流', 'Comprender contenidos culturales y mediáticos y participar en conversaciones sociales', [
        S('新闻与信息来源', 'Noticias y fuentes de información', '被动式与消息转述', '概述新闻并说明来源', 'Según varios medios, la medida fue aprobada después de un debate de varias horas.', '据多家媒体报道，该措施经过数小时讨论后获批。', 'fuente|来源;noticia|新闻;medio|媒体;aprobar|批准;informar|报道'),
        S('电影与文学评论', 'Reseñas de cine y literatura', '关系代词 que / quien / cuyo', '推荐作品并解释理由', 'La novela, cuyo protagonista busca sus orígenes, mantiene el interés hasta el final.', '这部小说的主人公寻找自己的根源，故事一直引人入胜到结尾。', 'reseña|评论;trama|情节;protagonista|主人公;obra|作品;emocionante|激动人心的'),
        S('传统与跨文化交流', 'Tradiciones y comunicación intercultural', '比较与表达文化差异', '介绍传统并避免刻板印象', 'Aunque algunas costumbres son distintas, es importante no convertirlas en estereotipos.', '尽管有些习俗不同，但重要的是不要把它们变成刻板印象。', 'costumbre|习俗;tradición|传统;diversidad|多样性;estereotipo|刻板印象;convivencia|共处'),
        S('组织社交活动', 'Organizar actividades sociales', '建议、邀请及虚拟式', '共同策划社区文化活动', 'Propongo que organicemos un encuentro para que los vecinos compartan sus tradiciones.', '我建议组织一次聚会，让邻居们分享各自的传统。', 'encuentro|聚会;participar|参与;organizar|组织;comunidad|社区;compartir|分享')
      ])
    ]
  },
  {
    pairId: 'zh-es', language: 'es', languageName: 'Espanol', level: 'B2',
    units: [
      U('复杂叙事与视角', 'Narración compleja y perspectiva', '灵活组织叙事、切换视角并突出重要信息', 'Organizar relatos complejos, cambiar de perspectiva y destacar información relevante', [
        S('叙事时间层次', 'Planos temporales del relato', 'pluscuamperfecto、indefinido 与 imperfecto', '解释一件事发生前后的完整背景', 'Cuando llegamos, la conferencia ya había empezado porque cambiaron el horario sin avisar.', '我们到达时会议已经开始了，因为他们更改时间却没有通知。', 'antecedente|前因;desenlace|结局;simultáneo|同时的;interrumpir|打断;anticipar|预先'),
        S('转述他人话语', 'Discurso referido', '间接引语中的时态呼应与代词变化', '准确转述采访或会议发言', 'La directora explicó que habían revisado la propuesta y que anunciarían su decisión pronto.', '负责人解释说他们已经审议了提案，并会很快宣布决定。', 'afirmar|声称;señalar|指出;declaración|声明;matizar|补充说明;atribuir|归因'),
        S('强调与信息焦点', 'Énfasis y foco informativo', '强调结构、倒装与 cleft sentences', '在故事中突出关键人物和原因', 'Fue precisamente aquella conversación la que me hizo reconsiderar toda la situación.', '正是那次谈话让我重新考虑了整个情况。', 'precisamente|恰恰;destacar|突出;reconsiderar|重新考虑;decisivo|决定性的;perspectiva|视角'),
        S('推测过去事件', 'Especular sobre hechos pasados', 'condicional compuesto、deber de、quizá + subjuntivo', '根据线索推测事件原因', 'Puede que se hubieran confundido de dirección, aunque también podrían haber perdido el tren.', '他们可能弄错了方向，也可能是没赶上火车。', 'indicio|线索;suponer|推测;probable|可能的;hipótesis|假设;dudar|怀疑')
      ]),
      U('论证、协商与正式交流', 'Argumentación, negociación y comunicación formal', '构建有层次的论点并在正式场合协商', 'Construir argumentos matizados y negociar en contextos formales', [
        S('构建论证', 'Estructurar una argumentación', '论证连接词、让步与反驳', '就公共政策发表结构化意见', 'Si bien la medida supone un coste inicial, sus beneficios a largo plazo lo compensan.', '尽管该措施有初始成本，但长期收益可以弥补。', 'premisa|前提;evidencia|证据;refutar|反驳;sostener|主张;coherente|连贯的'),
        S('表达保留意见', 'Expresar reservas y matices', '虚拟式、让步结构与缓和表达', '不同意提案但保留合作空间', 'No niego que la propuesta sea ambiciosa, pero dudo que pueda aplicarse tan rápidamente.', '我不否认提案很有雄心，但怀疑它能否如此迅速实施。', 'reserva|保留意见;matiz|细微差别;viable|可行的;cuestionar|质疑;prudente|谨慎的'),
        S('协商条件', 'Negociar condiciones', '条件句、条件式与正式请求', '商定项目预算和交付期限', 'Aceptaríamos el presupuesto siempre que se garantizara la entrega antes de septiembre.', '只要能保证九月前交付，我们就接受该预算。', 'negociar|协商;cláusula|条款;garantizar|保证;acuerdo|协议;concesión|让步'),
        S('正式书面沟通', 'Comunicación escrita formal', '正式语域、名词化与衔接', '撰写申请、投诉和回复', 'Por medio de la presente, solicito que se revise la resolución conforme al procedimiento establecido.', '本人特此请求依照既定程序重新审查该决定。', 'solicitud|申请;resolución|决定;procedimiento|程序;adjuntar|附上;remitir|发送')
      ]),
      U('科学、技术与数字社会', 'Ciencia, tecnología y sociedad digital', '讨论技术影响、解释过程并评估信息可信度', 'Debatir el impacto tecnológico, explicar procesos y evaluar la fiabilidad de la información', [
        S('解释技术过程', 'Explicar procesos tecnológicos', '被动式、无人称结构与步骤连接词', '向非专业人士解释数字服务原理', 'Los datos se cifran antes de ser enviados y solo pueden descodificarse con una clave segura.', '数据发送前会被加密，且只能用安全密钥解密。', 'cifrar|加密;algoritmo|算法;dispositivo|设备;procesar|处理;almacenamiento|存储'),
        S('评估网络信息', 'Evaluar información en línea', '证据强度、推测与引用来源', '辨别错误信息和可靠来源', 'Que una publicación se comparta miles de veces no significa que su contenido sea fiable.', '一条帖子被分享数千次并不意味着内容可靠。', 'fiable|可靠的;sesgo|偏见;verificar|核实;desinformación|虚假信息;credibilidad|可信度'),
        S('人工智能与伦理', 'Inteligencia artificial y ética', '抽象议题论证及虚拟式', '讨论自动化带来的伦理问题', 'Es fundamental que los sistemas automatizados sean transparentes y puedan ser supervisados.', '自动化系统保持透明并可接受监督至关重要。', 'automatización|自动化;ética|伦理;supervisar|监督;transparente|透明的;responsabilidad|责任'),
        S('创新与未来', 'Innovación y futuro', '未来完成时与概率表达', '预测技术对生活的长期影响', 'En una década, muchas tareas rutinarias habrán sido asumidas por sistemas inteligentes.', '十年后，许多日常任务可能已由智能系统承担。', 'innovación|创新;tendencia|趋势;avance|进展;adaptarse|适应;sostenible|可持续的')
      ]),
      U('环境、城市与公共政策', 'Medio ambiente, ciudades y políticas públicas', '分析环境问题、比较政策并提出可行方案', 'Analizar problemas ambientales, comparar políticas y proponer soluciones viables', [
        S('环境问题成因', 'Causas de los problemas ambientales', '因果链、名词化与被动结构', '解释污染或资源短缺的复杂原因', 'El aumento del consumo ha provocado una presión considerable sobre unos recursos ya limitados.', '消费增长给本已有限的资源造成了巨大压力。', 'escasez|短缺;recurso|资源;emisión|排放;degradación|恶化;consumo|消费'),
        S('评估解决方案', 'Evaluar soluciones', '条件、让步与利弊权衡', '比较不同减排措施', 'Aunque la inversión sea elevada, mejorar el transporte público reduciría tanto el tráfico como las emisiones.', '尽管投资很高，改善公共交通既能减少拥堵也能降低排放。', 'inversión|投资;reducir|减少;impacto|影响;eficacia|效力;alternativa|替代方案'),
        S('城市规划', 'Planificación urbana', '关系从句、目的与结果', '讨论宜居城市设计', 'Se necesitan barrios en los que los servicios básicos estén a poca distancia de las viviendas.', '需要建设基本服务离住宅不远的社区。', 'urbanismo|城市规划;vivienda|住房;infraestructura|基础设施;accesible|便利的;peatonal|步行的'),
        S('公民参与', 'Participación ciudadana', '正式建议与虚拟式', '在公众咨询中提交建议', 'Conviene que el ayuntamiento consulte a los residentes antes de modificar el espacio público.', '市政府在改造公共空间前最好咨询居民。', 'ayuntamiento|市政府;consulta|咨询;residente|居民;propuesta|提案;consenso|共识')
      ]),
      U('文化、身份与社会变化', 'Cultura, identidad y cambio social', '讨论文化身份与社会变化，理解隐含立场', 'Debatir la identidad cultural y el cambio social e interpretar posturas implícitas', [
        S('身份与归属', 'Identidad y pertenencia', '抽象名词、强调和对比结构', '讨论迁移经历中的身份认同', 'La identidad no es algo fijo, sino una construcción que evoluciona con nuestras experiencias.', '身份并非固定不变，而是随经历发展的建构。', 'identidad|身份;pertenencia|归属;raíces|根源;integración|融入;herencia|传承'),
        S('艺术解读', 'Interpretación artística', '隐喻、推断与评价性语言', '解释作品主题和创作手法', 'La ausencia de color parece sugerir una visión deliberadamente fría de la vida urbana.', '色彩的缺失似乎暗示一种刻意冷峻的城市生活观。', 'metáfora|隐喻;interpretar|解读;simbolizar|象征;estética|美学;obra|作品'),
        S('语言与社会', 'Lengua y sociedad', '语域、变体与间接评价', '讨论语言变化和社会态度', 'Las variedades lingüísticas no son errores, aunque a menudo se valoren de manera desigual.', '语言变体并不是错误，尽管它们经常受到不平等评价。', 'registro|语域;variedad|变体;prejuicio|偏见;evolución|演变;hablante|说话者'),
        S('社会变化', 'Transformaciones sociales', '趋势描述、比较数据和谨慎推断', '分析代际生活方式变化', 'Los datos apuntan a un cambio generacional, si bien todavía es pronto para extraer conclusiones definitivas.', '数据指向代际变化，但现在下定论仍为时过早。', 'generacional|代际的;tendencia|趋势;transformación|转变;dato|数据;conclusión|结论')
      ]),
      U('高级语用与综合表达', 'Pragmática avanzada y expresión integrada', '根据对象和场合调整语言并完成复杂综合任务', 'Adaptar el lenguaje al interlocutor y resolver tareas comunicativas complejas', [
        S('语域与礼貌策略', 'Registro y estrategias de cortesía', '缓和语、正式与非正式语域转换', '在敏感场合提出请求或批评', 'Quizá convendría revisar algunos aspectos del informe antes de presentarlo al comité.', '在向委员会提交报告前，也许应该复核其中一些方面。', 'atenuar|缓和;registro|语域;cortesía|礼貌;interlocutor|对话者;adecuado|恰当的'),
        S('言外之意与态度', 'Implicaturas y actitud', '反讽、模态词与语境推断', '理解说话者没有直接表达的态度', 'Cuando dijo que el resultado era «interesante», su tono dejaba claro que no estaba satisfecho.', '他说结果“很有意思”时，语气清楚表明他并不满意。', 'ironía|反讽;tono|语气;implícito|隐含的;intención|意图;interpretar|理解'),
        S('调解冲突', 'Mediación de conflictos', '转述、重构观点与达成共识', '帮助意见相左的双方沟通', 'Si he entendido bien, ambos queréis el mismo resultado, aunque proponéis métodos distintos.', '如果我理解正确，双方都想要同一结果，只是提出的方法不同。', 'mediar|调解;conflicto|冲突;reformular|重述;postura|立场;consenso|共识'),
        S('综合展示与问答', 'Presentación integrada y preguntas', '篇章组织、即兴回应与总结', '完成正式展示并回应质疑', 'Para concluir, los resultados respaldan la propuesta, aunque quedan varias cuestiones por investigar.', '总而言之，结果支持该提案，不过仍有若干问题有待研究。', 'respaldar|支持;exponer|陈述;sintetizar|概括;objeción|异议;concluir|总结')
      ])
    ]
  },
  {
    pairId: 'pair_1782569237717', language: 'en', languageName: 'English', level: 'B1',
    units: [
      U('经历、故事与人生变化', 'Experiences, Stories and Life Changes', '连贯讲述经历并描述过去与现在的变化', 'Tell connected stories and describe changes between the past and present', [
        S('组织过去事件', 'Sequencing Past Events', 'past simple / past continuous 与叙事连接词', '讲述旅途中发生的意外事件', 'While I was waiting for the train, I met a traveller who gave me some useful advice.', '等火车时，我遇到一位给了我实用建议的旅行者。', 'meanwhile|与此同时;suddenly|突然;eventually|最终;traveller|旅行者;incident|事件'),
        S('过去习惯与变化', 'Past Habits and Changes', 'used to / would / no longer', '比较童年和现在的生活方式', 'I used to spend every summer in the countryside, but I no longer have such long holidays.', '我过去每年夏天都在乡村度过，但现在不再有那么长的假期。', 'used to|过去常常;childhood|童年;lifestyle|生活方式;change|变化;countryside|乡村'),
        S('成就与经历', 'Achievements and Experiences', 'present perfect 与 past simple', '谈论个人成就和未完成目标', 'I have completed the course, although I have not received the certificate yet.', '我已经完成课程，不过还没有收到证书。', 'achievement|成就;certificate|证书;complete|完成;challenge|挑战;progress|进步'),
        S('故事细节与反应', 'Story Details and Reactions', '时间从句、原因和结果', '描述意外并解释处理方式', 'We missed our flight because of heavy traffic, so we had to change our plans.', '我们因交通拥堵误了航班，所以不得不改变计划。', 'miss|错过;traffic|交通;reaction|反应;solution|解决方案;unexpected|意外的')
      ]),
      U('观点、媒体与日常讨论', 'Opinions, Media and Everyday Discussion', '表达并支撑观点，礼貌回应他人立场', 'Express and support opinions and respond politely to other viewpoints', [
        S('表达与支撑观点', 'Expressing and Supporting Opinions', 'opinion phrases 与 supporting reasons', '讨论远程工作的影响', 'In my view, working from home can improve productivity when people have a suitable workspace.', '在我看来，如果有合适的工作空间，在家工作可以提高效率。', 'viewpoint|观点;support|支持;productivity|效率;suitable|合适的;claim|主张'),
        S('赞同与反对', 'Agreeing and Disagreeing', 'although / however / on the other hand', '在讨论中礼貌表达异议', 'I understand your argument; however, I do not agree with your conclusion.', '我理解你的论点，不过我不同意你的结论。', 'argument|论点;conclusion|结论;disagree|不同意;reasonable|合理的;respect|尊重'),
        S('原因与后果', 'Causes and Consequences', 'because of / therefore / as a result', '分析社交媒体使用方式', 'Many people turn off notifications because they interrupt their concentration.', '许多人关闭通知，因为通知会打断注意力。', 'consequence|后果;notification|通知;interrupt|打断;concentration|注意力;therefore|因此'),
        S('比较媒体信息', 'Comparing Media Sources', 'comparatives、whereas 与限定表达', '比较不同新闻来源', 'Online reports are updated faster, whereas printed articles often provide more context.', '网络报道更新更快，而纸质文章通常提供更多背景。', 'source|来源;report|报道;context|背景;whereas|然而;reliable|可靠的')
      ]),
      U('工作、学习与未来计划', 'Work, Study and Future Plans', '处理职场学习沟通并规划未来', 'Communicate at work and in education and discuss future plans', [
        S('求职面试', 'Job Applications and Interviews', '经历描述、技能与目的表达', '在面试中介绍相关能力', 'I have experience in customer service and I am able to solve problems under pressure.', '我有客户服务经验，也能在压力下解决问题。', 'application|申请;interview|面试;experience|经验;skill|技能;candidate|候选人'),
        S('会议和任务', 'Meetings and Tasks', 'obligation、requests 与 deadlines', '协调任务并确认期限', 'We have to submit the report by Friday, so I will divide the tasks today.', '我们必须周五前提交报告，因此我今天会分配任务。', 'deadline|截止期;submit|提交;task|任务;agenda|议程;coordinate|协调'),
        S('学习策略', 'Learning Strategies', 'first conditional 与 advice structures', '交流有效学习方法', 'If you practise a little every day, you will remember new vocabulary more easily.', '如果每天练习一点，你会更容易记住新词。', 'strategy|策略;review|复习;memorise|记忆;goal|目标;consistent|坚持的'),
        S('职业和学习规划', 'Career and Study Planning', 'future forms 与 hopes and intentions', '说明未来职业目标', 'In two years, I would like to take on more responsibility and lead a small team.', '两年后我希望承担更多责任并带领一个小团队。', 'career|职业生涯;promotion|晋升;responsibility|责任;qualification|资质;training|培训')
      ]),
      U('健康、消费与生活选择', 'Health, Consumption and Lifestyle Choices', '描述健康状况并讨论日常选择', 'Describe health conditions and discuss everyday lifestyle choices', [
        S('症状与医疗交流', 'Symptoms and Medical Communication', 'for / since、present perfect continuous', '向医生说明症状发展', 'I have been feeling exhausted for three days, and my throat has hurt since yesterday.', '我已经疲倦三天了，从昨天起喉咙也疼。', 'symptom|症状;exhausted|疲惫的;recover|恢复;treatment|治疗;appointment|预约'),
        S('建议与健康习惯', 'Advice and Healthy Habits', 'should / ought to / had better', '给朋友提出生活方式建议', 'You should rest more and avoid using your phone just before you go to sleep.', '你应该多休息，并避免临睡前使用手机。', 'advice|建议;avoid|避免;routine|日常习惯;well-being|健康;balanced|均衡的'),
        S('明智消费', 'Making Informed Purchases', 'too / enough、relative clauses', '比较产品并处理退换货', 'The device is light enough to carry, but it is too expensive for what it offers.', '这台设备足够轻便，但就其功能而言价格太高。', 'purchase|购买;refund|退款;warranty|保修;affordable|买得起的;feature|功能'),
        S('可持续生活', 'Sustainable Living', 'quantity、purpose 与 result clauses', '讨论减少日常浪费的方法', 'Buying only what we need can reduce waste and help us manage our budget.', '只购买所需物品可以减少浪费，也有助于管理预算。', 'waste|浪费;reusable|可重复使用的;budget|预算;reduce|减少;consume|消费')
      ]),
      U('旅行、服务与问题解决', 'Travel, Services and Problem Solving', '在旅行和服务场景中获取信息、投诉和解决问题', 'Get information, complain and solve problems in travel and service contexts', [
        S('预订和条件', 'Bookings and Conditions', 'indirect questions 与 polite requests', '确认住宿预订条款', 'Could you tell me whether breakfast is included and if I can cancel without a fee?', '您能告诉我是否含早餐，以及能否免费取消吗？', 'booking|预订;accommodation|住宿;included|包含的;cancel|取消;fee|费用'),
        S('投诉与退款', 'Complaints and Refunds', 'polite complaint language 与 requests', '说明服务问题并要求处理', 'The room does not match the description, so I would like to request a refund.', '房间与描述不符，因此我想申请退款。', 'complaint|投诉;match|相符;refund|退款;fault|故障;resolve|解决'),
        S('路线和公共交通', 'Directions and Public Transport', 'relative clauses 与 indirect questions', '询问换乘和目的地信息', 'Could you show me where to catch the bus that goes to the historic centre?', '您能告诉我去历史中心的公交车在哪里乘坐吗？', 'transfer|换乘;platform|站台;route|路线;destination|目的地;departure|出发'),
        S('推荐旅行体验', 'Recommending Travel Experiences', 'narrative tenses 与 recommendation forms', '分享旅行体验并给建议', 'The village we visited was beautiful, but it is worth booking accommodation in advance.', '我们游览的小镇很美，不过住宿值得提前预订。', 'scenery|风景;recommend|推荐;in advance|提前;explore|探索;journey|旅程')
      ]),
      U('文化、社区与社会话题', 'Culture, Community and Social Topics', '理解文化内容并讨论社区与社会议题', 'Understand cultural content and discuss community and social issues', [
        S('新闻概述', 'Summarising the News', 'passive voice 与 reporting verbs', '概述一则新闻并说明来源', 'According to several reports, the proposal was approved after a long public debate.', '据多篇报道，该提案经过长时间公开讨论后获批。', 'headline|标题;report|报道;approve|批准;debate|辩论;source|来源'),
        S('书影音评论', 'Reviews of Books and Films', 'relative clauses 与评价性形容词', '推荐作品并解释理由', 'The novel, which follows a family across three generations, remains engaging until the end.', '这部小说讲述一个家庭三代人的故事，一直到结尾都很吸引人。', 'review|评论;plot|情节;character|角色;engaging|吸引人的;recommendation|推荐'),
        S('文化差异', 'Cultural Differences', 'contrast、generalisation 与 qualification', '介绍习俗并避免过度概括', 'Although some customs are different, we should avoid turning them into stereotypes.', '尽管有些习俗不同，我们应避免把它们变成刻板印象。', 'custom|习俗;diversity|多样性;stereotype|刻板印象;tradition|传统;attitude|态度'),
        S('社区活动', 'Community Activities', 'suggestions、offers 与 arrangements', '策划社区文化活动', 'I suggest organising an event where neighbours can share food and traditions.', '我建议组织活动，让邻居们分享食物和传统。', 'community|社区;neighbour|邻居;volunteer|志愿者;organise|组织;participate|参加')
      ]),
      U('自然、环境与综合交流', 'Nature, Environment and Integrated Communication', '讨论环境问题并完成综合口笔语任务', 'Discuss environmental issues and complete integrated spoken and written tasks', [
        S('描述环境变化', 'Describing Environmental Change', '趋势表达、现在完成时与比较', '描述本地环境近年来的变化', 'The area has become much greener since the council created new parks and cycle lanes.', '自市政府建设新公园和自行车道后，该地区绿化改善了很多。', 'environment|环境;cycle lane|自行车道;improve|改善;pollution|污染;local|本地的'),
        S('原因和解决办法', 'Causes and Solutions', 'cause-effect linkers 与建议结构', '分析塑料污染并提出方案', 'Single-use packaging creates unnecessary waste; therefore, shops should offer reusable alternatives.', '一次性包装造成不必要的垃圾，因此商店应提供可重复使用的替代品。', 'packaging|包装;single-use|一次性的;alternative|替代品;protect|保护;resource|资源'),
        S('数据和图表说明', 'Describing Data and Trends', 'rise / fall / remain stable 与程度副词', '口头说明简单调查结果', 'The number of people using public transport rose steadily, while car use remained stable.', '使用公共交通的人数稳步上升，而汽车使用量保持稳定。', 'increase|增加;decline|下降;steadily|稳步地;survey|调查;figure|数字'),
        S('综合提案', 'An Integrated Proposal', '段落衔接、正式建议与总结', '提出改善社区环境的方案', 'To sum up, a safer cycling network would benefit residents, businesses and the environment.', '总之，更安全的自行车网络将使居民、企业和环境都受益。', 'proposal|提案;benefit|使受益;network|网络;resident|居民;practical|切实可行的')
      ])
    ]
  },
  {
    pairId: 'pair_1782569237717', language: 'en', languageName: 'English', level: 'B2',
    units: [
      U('复杂叙事与信息重构', 'Complex Narratives and Reframing Information', '运用多层时态、转述和强调结构组织复杂信息', 'Organise complex information using layered tenses, reporting and emphasis', [
        S('多层叙事时间', 'Layered Narrative Time', 'past perfect、past simple 与 past continuous', '解释事件发生前后的完整背景', 'By the time we arrived, the talk had already begun because the schedule had been changed.', '我们到达时讲座已经开始，因为日程已被更改。', 'background|背景;sequence|顺序;previously|先前;interrupt|打断;outcome|结果'),
        S('准确转述', 'Accurate Reported Speech', 'backshifting、reporting verbs 与 stance', '转述访谈或会议中的观点', 'The director explained that they had reviewed the plan and would announce a decision shortly.', '负责人解释说他们已经审议了计划，并会很快宣布决定。', 'state|陈述;claim|声称;acknowledge|承认;clarify|澄清;statement|声明'),
        S('强调关键信息', 'Focusing and Emphasising', 'cleft sentences、inversion 与 fronting', '突出故事中的关键原因', 'It was that unexpected conversation that made me reconsider the entire situation.', '正是那次意外的谈话让我重新考虑了整个情况。', 'emphasise|强调;crucial|关键的;reconsider|重新考虑;focus|重点;significant|重要的'),
        S('过去推测', 'Speculating about the Past', 'modal perfect forms', '根据有限线索推测事件', 'They might have taken the wrong road, although they could also have missed the last train.', '他们可能走错了路，也可能没赶上末班车。', 'clue|线索;assumption|假设;likely|可能的;speculate|推测;uncertain|不确定的')
      ]),
      U('论证、谈判与正式写作', 'Argument, Negotiation and Formal Writing', '构建细致论证并完成正式协商和写作', 'Build nuanced arguments and negotiate and write effectively in formal settings', [
        S('严密论证', 'Building a Rigorous Argument', 'concession、counterargument 与 evidence', '就公共议题发表结构化观点', 'While the policy involves an initial cost, the long-term benefits are likely to outweigh it.', '尽管该政策涉及初始成本，但长期收益很可能超过成本。', 'premise|前提;evidence|证据;counterargument|反论点;justify|论证;coherent|连贯的'),
        S('谨慎表达立场', 'Hedging and Qualifying Claims', 'hedging devices 与 cautious language', '表达保留意见和不确定性', 'The proposal appears promising, although it may be too early to assess its wider impact.', '该提案似乎很有前景，但现在评估其更广泛影响可能还太早。', 'apparently|看来;arguably|可以说;tentative|试探性的;assess|评估;reservation|保留意见'),
        S('谈判条件', 'Negotiating Conditions', 'mixed conditionals 与 diplomatic requests', '协商预算、范围和交付时间', 'We would accept the revised budget provided that delivery could be guaranteed by September.', '如果能保证九月前交付，我们会接受修订后的预算。', 'negotiate|谈判;term|条款;guarantee|保证;compromise|妥协;revised|修订的'),
        S('正式函件与报告', 'Formal Correspondence and Reports', 'nominalisation、formal register 与 cohesion', '撰写申请、投诉或简报', 'I am writing to request a review of the decision in accordance with the published procedure.', '我写信请求依照公布的程序重新审查该决定。', 'correspondence|函件;procedure|程序;request|请求;attach|附上;recommendation|建议')
      ]),
      U('科学、技术与信息素养', 'Science, Technology and Information Literacy', '解释技术过程、评估证据并讨论数字伦理', 'Explain technical processes, assess evidence and discuss digital ethics', [
        S('解释复杂过程', 'Explaining Complex Processes', 'passives、participles 与 process sequencing', '向非专业人士解释数据安全', 'The data is encrypted before being transmitted and can only be decoded with a secure key.', '数据传输前会被加密，且只能用安全密钥解码。', 'encrypt|加密;transmit|传输;decode|解码;device|设备;storage|存储'),
        S('核实网络信息', 'Verifying Online Information', 'source attribution、certainty 与 evidence', '辨别错误信息和可靠来源', 'The fact that a post has been widely shared does not necessarily make its content reliable.', '一条帖子被广泛分享并不一定说明内容可靠。', 'verify|核实;misinformation|错误信息;bias|偏见;credible|可信的;evidence|证据'),
        S('人工智能伦理', 'Ethics of Artificial Intelligence', 'subjunctive-style mandatives 与 abstract argument', '讨论自动决策的透明度', 'It is essential that automated systems remain transparent and subject to human oversight.', '自动化系统保持透明并接受人工监督至关重要。', 'automated|自动化的;oversight|监督;ethical|伦理的;accountability|问责;transparent|透明的'),
        S('预测技术变化', 'Forecasting Technological Change', 'future perfect、probability 与 trends', '预测技术的长期影响', 'Within a decade, intelligent systems will have taken over many routine administrative tasks.', '十年内，智能系统将接管许多日常行政任务。', 'innovation|创新;trend|趋势;breakthrough|突破;adapt|适应;sustainable|可持续的')
      ]),
      U('环境、城市与政策分析', 'Environment, Cities and Policy Analysis', '分析复杂环境问题并评估公共方案', 'Analyse complex environmental problems and evaluate public solutions', [
        S('环境因果链', 'Environmental Cause and Effect', 'nominalisation、cause chains 与 passive forms', '解释资源压力和污染成因', 'Rising consumption has placed considerable pressure on resources that were already limited.', '消费增长给本已有限的资源造成了巨大压力。', 'scarcity|短缺;emission|排放;degradation|恶化;consumption|消费;resource|资源'),
        S('政策效果评估', 'Evaluating Policy Options', 'trade-offs、concession 与 condition', '比较不同减排政策', 'Despite the high investment, better public transport would reduce both congestion and emissions.', '尽管投资很高，更好的公共交通将减少拥堵和排放。', 'trade-off|权衡;investment|投资;effective|有效的;impact|影响;alternative|替代方案'),
        S('城市规划与住房', 'Urban Planning and Housing', 'relative structures、purpose 与 result', '讨论宜居社区设计', 'Cities need neighbourhoods in which essential services are within walking distance of homes.', '城市需要建设基本服务离住宅步行可达的社区。', 'infrastructure|基础设施;housing|住房;accessible|便利的;pedestrian|步行的;neighbourhood|社区'),
        S('公众参与决策', 'Public Participation in Decisions', 'formal recommendations 与 consultation language', '向地方政府提出建议', 'The council should consult residents before making substantial changes to public space.', '市政府在大幅改变公共空间前应咨询居民。', 'consultation|咨询;resident|居民;consensus|共识;proposal|提案;stakeholder|利益相关者')
      ]),
      U('文化、身份与社会变迁', 'Culture, Identity and Social Change', '理解文化作品和社会讨论中的隐含意义', 'Interpret implicit meaning in cultural works and social debate', [
        S('身份与归属感', 'Identity and Belonging', 'abstract language、contrast 与 emphasis', '讨论迁移和多重身份', 'Identity is not fixed but is continually reshaped by experience, language and relationships.', '身份并非固定不变，而是不断被经历、语言和关系重塑。', 'identity|身份;belonging|归属;heritage|传承;integration|融入;roots|根源'),
        S('解读艺术作品', 'Interpreting Works of Art', 'metaphor、inference 与 evaluative language', '分析作品主题和表现手法', 'The absence of colour seems to suggest a deliberately cold view of modern urban life.', '色彩的缺失似乎暗示一种刻意冷峻的现代城市生活观。', 'metaphor|隐喻;symbolise|象征;aesthetic|美学;interpretation|解读;deliberate|刻意的'),
        S('语言态度', 'Language and Social Attitudes', 'register、variation 与 implicit judgement', '讨论口音、方言和偏见', 'Language varieties are not errors, even though they are often valued unequally.', '语言变体并不是错误，尽管它们常受到不平等评价。', 'register|语域;dialect|方言;prejudice|偏见;variation|变体;speaker|说话者'),
        S('分析社会趋势', 'Analysing Social Trends', 'data commentary、hedging 与 cautious inference', '分析代际生活方式变化', 'The figures point to a generational shift, although it is too soon to draw firm conclusions.', '这些数字指向代际转变，但现在下定论仍为时过早。', 'generational|代际的;shift|转变;figure|数字;pattern|模式;conclusion|结论')
      ]),
      U('高级语用、调解与展示', 'Advanced Pragmatics, Mediation and Presentation', '根据场合调整表达、调解观点并完成专业展示', 'Adapt language to context, mediate viewpoints and deliver professional presentations', [
        S('语域和礼貌', 'Register and Politeness', 'mitigation、diplomatic language 与 register shifts', '敏感地提出请求和批评', 'It might be worth reviewing a few sections of the report before presenting it to the board.', '在向董事会提交报告前，或许值得复核其中几个部分。', 'mitigate|缓和;register|语域;diplomatic|婉转的;appropriate|恰当的;audience|受众'),
        S('理解言外之意', 'Implied Meaning and Attitude', 'implicature、irony 与 intonation', '从语境判断隐含态度', 'When she called the result “interesting”, her tone made it clear that she was disappointed.', '她称结果“有意思”时，语气清楚表明她很失望。', 'irony|反讽;implied|隐含的;tone|语气;intention|意图;interpret|理解'),
        S('观点调解', 'Mediating Viewpoints', 'reframing、summarising 与 neutral language', '帮助意见不同的双方寻找共同点', 'If I understand correctly, both sides want the same outcome but favour different methods.', '如果我理解正确，双方想要同一结果，只是偏好的方法不同。', 'mediate|调解;reframe|重构;position|立场;common ground|共同点;conflict|冲突'),
        S('专业展示与答问', 'Professional Presentations and Questions', 'signposting、spontaneous response 与 synthesis', '展示研究结果并回应质疑', 'To conclude, the findings support the proposal, although several questions require further research.', '总而言之，研究结果支持该提案，不过若干问题还需进一步研究。', 'finding|研究结果;objection|异议;synthesise|综合;highlight|强调;conclude|总结')
      ])
    ]
  }
]

function distractors(course, unitIndex, sectionIndex) {
  const sections = course.units.flatMap(unit => unit.sections)
  const current = unitIndex * 4 + sectionIndex
  return [1, 2, 3].map(offset => sections[(current + offset * 5) % sections.length])
}

function makeQuestions(course, unit, section, unitIndex, sectionIndex) {
  const prefix = `${course.languageName.toLowerCase()}-${course.level.toLowerCase()}-u${String(unitIndex + 1).padStart(2, '0')}-s${String(sectionIndex + 1).padStart(2, '0')}`
  const sectionId = `${course.pairId}/U${String(unitIndex + 1).padStart(2, '0')}-S${String(sectionIndex + 1).padStart(2, '0')}`
  const other = distractors(course, unitIndex, sectionIndex)
  const common = {
    language: course.language,
    cefr: course.level,
    unit: `u${String(unitIndex + 1).padStart(2, '0')}`,
    unitTheme: unit.target,
    difficulty: course.level === 'B1' ? 3 : 4,
    tags: [course.level, course.pairId, section.target],
    sectionId,
    pairId: course.pairId
  }
  return [
    {
      id: `${prefix}-1`, type: 'T03', typeName: '双向配对', ...common,
      pairs: section.words.slice(0, 4).map(word => ({ left: word.target, right: word.zh }))
    },
    {
      id: `${prefix}-2`, type: 'T07', typeName: '翻译选择', ...common,
      sourceText: section.translation, sourceLang: 'zh',
      options: [section.example, ...other.map(item => item.example)], answerIdx: 0
    },
    {
      id: `${prefix}-3`, type: 'T08', typeName: '听力选择', ...common,
      audioText: section.example, question: '这句话表达的意思是什么？',
      options: [section.translation, ...other.map(item => item.translation)], answerIdx: 0
    },
    {
      id: `${prefix}-4`, type: 'T10', typeName: '翻译输入', ...common,
      sourceText: section.translation, sourceLang: 'zh', acceptedAnswers: [section.example],
      hint: `使用本节语法：${section.grammar}`
    },
    {
      id: `${prefix}-5`, type: 'T12', typeName: '情景回应', ...common,
      scenario: `${section.scenario}。请选择最完整、最符合语境的表达。`,
      options: [section.example, ...other.slice(0, 2).map(item => item.example)], answerIdx: 0,
      pragmaticsNote: '正确选项同时符合本节场景、语法目标和表达意图；其他选项语言本身成立，但属于不同交际场景。'
    }
  ]
}

const config = read('system-config.json')
for (const pair of config.languagePairs) {
  if (['zh-es', 'pair_1782569237717'].includes(pair.id)) {
    pair.cefrLevels = [...new Set([...(pair.cefrLevels || []), 'B1', 'B2'])].sort()
  }
}

const vocabulary = read('vocabulary.json')
const framework = read('unit-framework.json')
let questions = read('questions.json')

for (const course of courses) {
  const words = [...new Set(course.units.flatMap(unit => unit.sections.flatMap(section => section.words.map(word => word.target))))]
  vocabulary.data[course.languageName] ||= {}
  vocabulary.data[course.languageName][course.level] = words.join(', ')

  framework[course.pairId] ||= {}
  framework[course.pairId][course.level] = {
    units: course.units.map((unit, unitIndex) => ({
      id: `U${String(unitIndex + 1).padStart(2, '0')}`,
      titleNative: unit.native,
      titleTarget: unit.target,
      goalNative: unit.goal,
      goalTarget: unit.targetGoal,
      vocabCount: new Set(unit.sections.flatMap(section => section.words.map(word => word.target))).size,
      grammarPoints: unit.sections.map(section => section.grammar),
      scenarios: unit.sections.map(section => section.scenario),
      sections: unit.sections.map((section, sectionIndex) => ({
        id: `S${String(sectionIndex + 1).padStart(2, '0')}`,
        titleNative: section.native,
        titleTarget: section.target,
        coveredWords: section.words.map(word => word.target),
        grammarPoint: section.grammar,
        scenario: section.scenario
      }))
    }))
  }

  questions = questions.filter(question => !(question.pairId === course.pairId && question.cefr === course.level))
  questions.push(...course.units.flatMap((unit, unitIndex) =>
    unit.sections.flatMap((section, sectionIndex) => makeQuestions(course, unit, section, unitIndex, sectionIndex))))
}

// Repair legacy A2 seed rows produced by an old q10 call signature.
for (const question of questions) {
  if (typeof question.unitTheme !== 'string') {
    const unitId = question.sectionId?.match(/\/(U\d+)-/)?.[1]
    const unit = framework[question.pairId]?.[question.cefr]?.units?.find(item => item.id === unitId)
    question.unitTheme = unit?.titleTarget || `${question.cefr} course`
  }
}

write('system-config.json', config)
write('vocabulary.json', vocabulary)
write('unit-framework.json', framework)
write('questions.json', questions)

console.log(`Seeded ${courses.length} courses, ${courses.reduce((n, c) => n + c.units.length, 0)} units, ${courses.reduce((n, c) => n + c.units.flatMap(u => u.sections).length, 0)} sections and ${courses.reduce((n, c) => n + c.units.flatMap(u => u.sections).length * 5, 0)} questions.`)
