/**
 * Generate content-studio/data/zh-es-a2-seed.json
 * Run: node content-studio/scripts/generate-zh-es-a2-seed.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data/zh-es-a2-seed.json");
const PAIR_ID = "zh-es";
const CEFR = "A2";

function parseId(id) {
  const m = id.match(/u(\d+)-s(\d+)/i);
  if (!m) throw new Error(`Bad question id: ${id}`);
  return { unitId: `U${m[1]}`, sectionId: `S${m[2]}` };
}

function baseMeta(id, unitTheme) {
  const { unitId, sectionId } = parseId(id);
  return {
    language: "es",
    cefr: CEFR,
    unit: unitId.toLowerCase(),
    unitTheme,
    difficulty: 2,
    tags: ["A2", "zh-es"],
    sectionId: `${PAIR_ID}/${unitId}-${sectionId}`,
    pairId: PAIR_ID,
  };
}

function q05(id, sentence, options, answerIdx, unitTheme) {
  return {
    id,
    type: "T05",
    typeName: "补全句子",
    ...baseMeta(id, unitTheme),
    sentence,
    blank: options[answerIdx],
    options,
    answerIdx,
  };
}

function q07(id, sourceText, options, answerIdx, unitTheme = "A2") {
  return {
    id,
    type: "T07",
    typeName: "翻译选择",
    ...baseMeta(id, unitTheme),
    sourceText,
    sourceLang: "es",
    options,
    answerIdx,
  };
}

function q08(id, audioText, question, options, answerIdx, unitTheme = "A2") {
  return {
    id,
    type: "T08",
    typeName: "听力选择",
    ...baseMeta(id, unitTheme),
    audioText,
    question,
    options,
    answerIdx,
  };
}

function q12(id, scenario, options, answerIdx, unitTheme = "A2") {
  return {
    id,
    type: "T12",
    typeName: "情景回应",
    ...baseMeta(id, unitTheme),
    scenario,
    options,
    answerIdx,
  };
}

function q06(id, words, targetSentence, unitTheme = "A2") {
  return {
    id,
    type: "T06",
    typeName: "句子排序",
    ...baseMeta(id, unitTheme),
    words,
    targetSentence,
  };
}

function q10(id, sourceText, acceptedAnswers, unitTheme = "A2") {
  return {
    id,
    type: "T10",
    typeName: "翻译输入",
    ...baseMeta(id, unitTheme),
    sourceText,
    sourceLang: "es",
    acceptedAnswers: Array.isArray(acceptedAnswers) ? acceptedAnswers : [acceptedAnswers],
    hint: "输入中文翻译",
  };
}

function q03(id, pairs, unitTheme = "A2") {
  return {
    id,
    type: "T03",
    typeName: "双向配对",
    ...baseMeta(id, unitTheme),
    pairs,
  };
}

const UNITS = [
  {
    id: "U01",
    titleNative: "过去经历与回忆",
    titleTarget: "Experiencias pasadas",
    goalNative: "用过去时描述周末和假期经历，谈论已完成的动作",
    goalTarget: "Describir experiencias del fin de semana y vacaciones usando el pretérito",
    sections: [
      {
        id: "S01",
        titleNative: "过去时间标志词",
        titleTarget: "Marcadores de tiempo pasado",
        questions: [
          q05("espanol-a2-u01-s01-1", "Ayer ___ al cine con mis amigos.", ["fui", "voy", "iré", "iba"], 0, "Experiencias pasadas"),
          q07("espanol-a2-u01-s01-2", "El año pasado viajé a Barcelona.", ["去年我去了巴塞罗那", "明年我去巴塞罗那", "我每天去巴塞罗那", "我想去巴塞罗那"], 0, "Experiencias pasadas"),
          q08("espanol-a2-u01-s01-3", "Anoche cené con mi familia.", "¿Qué hizo la persona anoche?", ["Anoche cenó con su familia", "Esta noche cenará fuera", "Nunca cena en casa", "Está cenando ahora"], 0, "Experiencias pasadas"),
          q12("espanol-a2-u01-s01-4", "你的朋友问：「¿Qué hiciste el fin de semana?」你想说上周末去了公园。", ["Fui al parque el fin de semana pasado.", "Voy al parque cada día.", "Iré al parque mañana.", "No me gusta el parque."], 0, "Experiencias pasadas"),
        ],
      },
      {
        id: "S02",
        titleNative: "规则动词过去时",
        titleTarget: "Pretérito de verbos regulares",
        questions: [
          q05("espanol-a2-u01-s02-1", "María ___ español en la universidad el año pasado.", ["estudió", "estudia", "estudiará", "estudiaba"], 0, "Experiencias pasadas"),
          q07("espanol-a2-u01-s02-2", "Trabajé ocho horas ayer.", ["我昨天工作了八小时", "我明天工作八小时", "我每天工作", "我不想工作"], 0, "Experiencias pasadas"),
          q12("espanol-a2-u01-s02-3", "同事问你是否完成了报告，你想说昨天完成了。", ["Terminé el informe ayer.", "Termino el informe ahora.", "Terminaré el informe mañana.", "No tengo informe."], 0, "Experiencias pasadas"),
          q10("espanol-a2-u01-s02-4", "Anoche cociné pasta.", ["昨晚我做了意大利面", "昨晚我点了外卖", "我每晚都做饭"], "Experiencias pasadas"),
        ],
      },
      {
        id: "S03",
        titleNative: "常用不规则动词过去时",
        titleTarget: "Pretérito irregular",
        questions: [
          q05("espanol-a2-u01-s03-1", "Yo ___ a Madrid el mes pasado.", ["fui", "voy", "iba", "iré"], 0, "Experiencias pasadas"),
          q05("espanol-a2-u01-s03-2", "Ellos ___ una película muy interesante.", ["vieron", "ven", "verán", "veían"], 0, "Experiencias pasadas"),
          q07("espanol-a2-u01-s03-3", "Hice ejercicio por la mañana.", ["我早上锻炼了", "我明天锻炼", "我不喜欢运动", "我正在锻炼"], 0, "Experiencias pasadas"),
          q08("espanol-a2-u01-s03-4", "Tuvimos un problema con el tren.", "¿Qué les pasó?", ["Tuvieron un problema con el tren", "Tienen un tren nuevo", "Van en tren ahora", "No usan el tren"], 0, "Experiencias pasadas"),
        ],
      },
      {
        id: "S04",
        titleNative: "过去经历综合",
        titleTarget: "Práctica integral del pasado",
        questions: [
          q07("espanol-a2-u01-s04-1", "El verano pasado aprendí a nadar.", ["去年夏天我学会了游泳", "明年夏天我学游泳", "我不会游泳", "我正在游泳"], 0, "Experiencias pasadas"),
          q06("espanol-a2-u01-s04-2", ["El", "año", "pasado", "visité", "a", "mis", "abuelos."], "El año pasado visité a mis abuelos.", "Experiencias pasadas"),
          q12("espanol-a2-u01-s04-3", "面试时对方问上一份工作做了什么，你想说在一家公司当了两年助理。", ["Trabajé dos años como asistente en una empresa.", "Trabajo como asistente ahora.", "Trabajaré como asistente.", "Nunca he trabajado."], 0, "Experiencias pasadas"),
          q03("espanol-a2-u01-s04-4", [
            { left: "ayer", right: "昨天" },
            { left: "el año pasado", right: "去年" },
            { left: "anoche", right: "昨晚" },
            { left: "el fin de semana pasado", right: "上周末" },
          ], "Experiencias pasadas"),
        ],
      },
    ],
  },
  {
    id: "U02",
    titleNative: "健康与身体",
    titleTarget: "Salud y el cuerpo",
    goalNative: "描述身体不适，理解医生建议，谈论健康习惯",
    goalTarget: "Describir malestares, entender consejos médicos y hablar de hábitos saludables",
    sections: [
      {
        id: "S01",
        titleNative: "身体部位与不适",
        titleTarget: "Partes del cuerpo y malestares",
        questions: [
          q05("espanol-a2-u02-s01-1", "Me duele la ___ desde ayer.", ["cabeza", "coche", "casa", "ciudad"], 0, "Salud y el cuerpo"),
          q07("espanol-a2-u02-s01-2", "Tengo dolor de garganta.", ["我喉咙痛", "我肚子饿", "我很开心", "我想睡觉"], 0, "Salud y el cuerpo"),
          q08("espanol-a2-u02-s01-3", "Me duele mucho la espalda.", "¿Cómo se siente la persona?", ["Le duele mucho la espalda", "Está muy contento", "Quiere correr", "Está de vacaciones"], 0, "Salud y el cuerpo"),
          q12("espanol-a2-u02-s01-4", "在药店，药剂师问哪里不舒服，你想说头疼两天了。", ["Me duele la cabeza desde hace dos días.", "Me gusta esta farmacia.", "Busco un regalo.", "No necesito nada."], 0, "Salud y el cuerpo"),
        ],
      },
      {
        id: "S02",
        titleNative: "看医生与建议",
        titleTarget: "Visita al médico",
        questions: [
          q05("espanol-a2-u02-s02-1", "El médico me ___ que descanse más.", ["dijo", "dice", "dirá", "decía"], 0, "Salud y el cuerpo"),
          q07("espanol-a2-u02-s02-2", "Debes tomar esta medicina tres veces al día.", ["你应该一天吃三次这个药", "你应该每天运动", "你不舒服吗", "药很贵"], 0, "Salud y el cuerpo"),
          q12("espanol-a2-u02-s02-3", "医生建议你多喝水、少熬夜，你想确认会照做。", ["De acuerdo, beberé más agua y dormiré mejor.", "No quiero agua.", "Mañana empiezo a correr.", "No tengo tiempo."], 0, "Salud y el cuerpo"),
          q10("espanol-a2-u02-s02-4", "Necesito una cita con el doctor.", ["我需要预约医生", "我是医生", "医院很远"], "Salud y el cuerpo"),
        ],
      },
      {
        id: "S03",
        titleNative: "健康习惯",
        titleTarget: "Hábitos saludables",
        questions: [
          q05("espanol-a2-u02-s03-1", "Para estar sano, es importante ___ regularmente.", ["hacer ejercicio", "comer dulces", "dormir poco", "fumar"], 0, "Salud y el cuerpo"),
          q07("espanol-a2-u02-s03-2", "Intento comer más frutas y verduras.", ["我尽量多吃水果蔬菜", "我只吃肉", "我不吃水果", "我在做饭"], 0, "Salud y el cuerpo"),
          q06("espanol-a2-u02-s03-3", ["Duermo", "ocho", "horas", "cada", "noche."], "Duermo ocho horas cada noche.", "Salud y el cuerpo"),
          q12("espanol-a2-u02-s03-4", "朋友熬夜又感冒，你想建议他早点休息。", ["Deberías descansar más y dormir temprano.", "Debes salir más.", "Come más dulces.", "No pasa nada."], 0, "Salud y el cuerpo"),
        ],
      },
      {
        id: "S04",
        titleNative: "健康场景综合",
        titleTarget: "Práctica integral de salud",
        questions: [
          q08("espanol-a2-u02-s04-1", "Me siento muy cansado y tengo fiebre.", "¿Qué debería hacer?", ["Descansar y tomar medicina", "Salir a correr", "Ir a una fiesta", "Beber café"], 0, "Salud y el cuerpo"),
          q07("espanol-a2-u02-s04-2", "La farmacia está cerca del hospital.", ["药店在医院附近", "药店在医院里面", "医院关闭了", "我不舒服"], 0, "Salud y el cuerpo"),
          q03("espanol-a2-u02-s04-3", [
            { left: "cabeza", right: "头" },
            { left: "garganta", right: "喉咙" },
            { left: "estómago", right: "胃" },
            { left: "espalda", right: "背" },
          ], "Salud y el cuerpo"),
          q12("espanol-a2-u02-s04-4", "急诊护士问你的症状，你想说发烧且咳嗽。", ["Tengo fiebre y tos.", "Estoy muy bien.", "Quiero ir a casa.", "No hablo español."], 0, "Salud y el cuerpo"),
        ],
      },
    ],
  },
  {
    id: "U03",
    titleNative: "比较与描述",
    titleTarget: "Comparaciones y descripciones",
    goalNative: "比较人物、地点和事物，使用比较级和最高级",
    goalTarget: "Comparar personas, lugares y cosas usando comparativos y superlativos",
    sections: [
      {
        id: "S01",
        titleNative: "比较级基础",
        titleTarget: "Comparativos básicos",
        questions: [
          q05("espanol-a2-u03-s01-1", "Mi hermano es ___ que yo.", ["más alto", "alto", "el más alto", "altos"], 0, "Comparaciones"),
          q07("espanol-a2-u03-s01-2", "Este restaurante es mejor que el otro.", ["这家餐厅比另一家好", "这家餐厅很贵", "我不喜欢餐厅", "餐厅关门了"], 0, "Comparaciones"),
          q08("espanol-a2-u03-s01-3", "Madrid es más grande que mi ciudad.", "¿Qué significa la frase?", ["Madrid es de mayor tamaño que su ciudad", "Su ciudad es más grande", "Madrid es pequeño", "No comparan ciudades"], 0, "Comparaciones"),
          q12("espanol-a2-u03-s01-4", "朋友问两部电影哪部更好，你想说第一部更有趣。", ["La primera película es más interesante.", "Las dos son iguales.", "No vi ninguna.", "Odio el cine."], 0, "Comparaciones"),
        ],
      },
      {
        id: "S02",
        titleNative: "menos / tan ... como",
        titleTarget: "Menos y tan...como",
        questions: [
          q05("espanol-a2-u03-s02-1", "Hoy hace ___ frío que ayer.", ["menos", "más", "muy", "tan"], 0, "Comparaciones"),
          q07("espanol-a2-u03-s02-2", "Corro tan rápido como mi amigo.", ["我跑得和朋友一样快", "我比朋友快", "我不跑步", "朋友很慢"], 0, "Comparaciones"),
          q06("espanol-a2-u03-s02-3", ["Este", "libro", "es", "menos", "difícil", "que", "el", "otro."], "Este libro es menos difícil que el otro.", "Comparaciones"),
          q10("espanol-a2-u03-s02-4", "Mi casa es tan cómoda como la tuya.", ["我家和你家一样舒适", "我家更大", "我喜欢你家"], "Comparaciones"),
        ],
      },
      {
        id: "S03",
        titleNative: "最高级",
        titleTarget: "Superlativos",
        questions: [
          q05("espanol-a2-u03-s03-1", "Es ___ restaurante de la ciudad.", ["el mejor", "mejor", "más bueno", "bueno"], 0, "Comparaciones"),
          q07("espanol-a2-u03-s03-2", "Es el edificio más antiguo del barrio.", ["它是街区最古老的建筑", "它是新建的", "它很高", "我不住那里"], 0, "Comparaciones"),
          q12("espanol-a2-u03-s03-3", "你想说这座城市里这家博物馆最有名。", ["Es el museo más famoso de la ciudad.", "Es un museo pequeño.", "No hay museos.", "Cerraron el museo."], 0, "Comparaciones"),
          q08("espanol-a2-u03-s03-4", "Mi hermana es la persona más amable de la familia.", "¿Cómo es la hermana?", ["Es la más amable de la familia", "Es la más alta", "No tiene familia", "Es muy seria"], 0, "Comparaciones"),
        ],
      },
      {
        id: "S04",
        titleNative: "比较与描述综合",
        titleTarget: "Práctica integral",
        questions: [
          q05("espanol-a2-u03-s04-1", "El invierno en el norte es ___ duro que aquí.", ["más", "menos", "muy", "tan"], 0, "Comparaciones"),
          q07("espanol-a2-u03-s04-2", "Prefiero el café más fuerte.", ["我更喜欢浓一点的咖啡", "我不喝咖啡", "茶更好", "水很冷"], 0, "Comparaciones"),
          q03("espanol-a2-u03-s04-3", [
            { left: "más...que", right: "比…更" },
            { left: "menos...que", right: "比…更少" },
            { left: "tan...como", right: "和…一样" },
            { left: "el más", right: "最" },
          ], "Comparaciones"),
          q12("espanol-a2-u03-s04-4", "租房时中介问需求，你想说需要比现在这个更大的房间。", ["Necesito una habitación más grande que esta.", "Esta habitación es perfecta.", "No necesito habitación.", "Quiero la más pequeña."], 0, "Comparaciones"),
        ],
      },
    ],
  },
  {
    id: "U04",
    titleNative: "计划与未来",
    titleTarget: "Planes y futuro",
    goalNative: "谈论近期计划和将来打算，使用 ir a + infinitivo 和简单将来时",
    goalTarget: "Hablar de planes próximos y futuro con ir a + infinitivo",
    sections: [
      {
        id: "S01",
        titleNative: "近期计划 ir a",
        titleTarget: "Planes con ir a + infinitivo",
        questions: [
          q05("espanol-a2-u04-s01-1", "Mañana voy a ___ mis abuelos.", ["visitar", "visité", "visitaba", "visitaré"], 0, "Planes y futuro"),
          q07("espanol-a2-u04-s01-2", "Esta noche vamos a estudiar juntos.", ["今晚我们要一起学习", "昨晚我们学习了", "我们不想学习", "正在学习"], 0, "Planes y futuro"),
          q08("espanol-a2-u04-s01-3", "El próximo mes voy a cambiar de trabajo.", "¿Qué hará la persona?", ["Cambiará de trabajo el próximo mes", "Cambió de trabajo ayer", "No trabaja", "Está de vacaciones"], 0, "Planes y futuro"),
          q12("espanol-a2-u04-s01-4", "同事问周末安排，你想说打算去海边。", ["El fin de semana voy a ir a la playa.", "Fui a la playa ayer.", "No me gusta la playa.", "Estoy en la playa."], 0, "Planes y futuro"),
        ],
      },
      {
        id: "S02",
        titleNative: "将来时表达",
        titleTarget: "Futuro simple",
        questions: [
          q05("espanol-a2-u04-s02-1", "El año que viene ___ a Londres.", ["viajaré", "viajé", "viajo", "viajaba"], 0, "Planes y futuro"),
          q07("espanol-a2-u04-s02-2", "Te llamaré cuando llegue a casa.", ["我到家后会给你打电话", "昨天给你打电话了", "不想打电话", "正在打电话"], 0, "Planes y futuro"),
          q06("espanol-a2-u04-s02-3", ["El", "próximo", "verano", "viajaré", "a", "Italia."], "El próximo verano viajaré a Italia.", "Planes y futuro"),
          q10("espanol-a2-u04-s02-4", "¿Qué harás este fin de semana?", ["这个周末你要做什么", "昨天做了什么", "我喜欢周末"], "Planes y futuro"),
        ],
      },
      {
        id: "S03",
        titleNative: "旅行与安排",
        titleTarget: "Viajes y organización",
        questions: [
          q05("espanol-a2-u04-s03-1", "Ya ___ las maletas para el viaje.", ["he preparado", "preparo", "prepararé", "preparaba"], 0, "Planes y futuro"),
          q07("espanol-a2-u04-s03-2", "Necesito reservar un hotel para dos noches.", ["我需要订两晚酒店", "酒店很便宜", "我不旅行", "已经回家了"], 0, "Planes y futuro"),
          q12("espanol-a2-u04-s03-3", "海关人员问来做什么，你想说来出差三天。", ["Vengo por trabajo tres días.", "Vivo aquí.", "Vengo de vacaciones un mes.", "No sé."], 0, "Planes y futuro"),
          q08("espanol-a2-u04-s03-4", "Salimos del aeropuerto a las ocho.", "¿A qué hora salen?", ["A las ocho", "A las diez de la noche", "No salen", "Ya llegaron"], 0, "Planes y futuro"),
        ],
      },
      {
        id: "S04",
        titleNative: "计划场景综合",
        titleTarget: "Práctica integral de planes",
        questions: [
          q07("espanol-a2-u04-s04-1", "Tengo una reunión importante mañana por la mañana.", ["我明天上午有重要会议", "会议结束了", "我不喜欢开会", "昨晚开会了"], 0, "Planes y futuro"),
          q03("espanol-a2-u04-s04-2", [
            { left: "mañana", right: "明天" },
            { left: "el próximo mes", right: "下个月" },
            { left: "el fin de semana", right: "本周末" },
            { left: "el año que viene", right: "明年" },
          ], "Planes y futuro"),
          q12("espanol-a2-u04-s04-3", "朋友邀请你下个月一起学西班牙语，你想答应并开始上课。", ["El mes que viene voy a empezar clases de español contigo.", "No quiero estudiar.", "Estudié ayer.", "Ya hablo perfecto."], 0, "Planes y futuro"),
          q05("espanol-a2-u04-s04-4", "Esta tarde ___ al supermercado.", ["iré", "fui", "iba", "voy"], 0, "Planes y futuro"),
        ],
      },
    ],
  },
  {
    id: "U05",
    titleNative: "观点与建议",
    titleTarget: "Opiniones y consejos",
    goalNative: "表达观点和偏好，给出建议，使用 creo que / me parece",
    goalTarget: "Expresar opiniones, preferencias y dar consejos",
    sections: [
      {
        id: "S01",
        titleNative: "表达观点",
        titleTarget: "Expresar opiniones",
        questions: [
          q05("espanol-a2-u05-s01-1", "___ que esta película es muy buena.", ["Creo", "Creí", "Crear", "Creado"], 0, "Opiniones y consejos"),
          q07("espanol-a2-u05-s01-2", "Me parece interesante aprender idiomas.", ["我觉得学语言很有趣", "我讨厌语言", "我在睡觉", "语言很难"], 0, "Opiniones y consejos"),
          q12("espanol-a2-u05-s01-3", "讨论餐厅时，你想说觉得服务很好但价格偏高。", ["Me parece que el servicio es bueno pero el precio es alto.", "El restaurante es perfecto.", "No como fuera.", "Odio este lugar."], 0, "Opiniones y consejos"),
          q08("espanol-a2-u05-s01-4", "Creo que deberíamos salir más temprano.", "¿Qué opina el hablante?", ["Deberían salir más temprano", "Deben quedarse", "Ya salieron", "No tienen planes"], 0, "Opiniones y consejos"),
        ],
      },
      {
        id: "S02",
        titleNative: "建议与劝告",
        titleTarget: "Dar consejos",
        questions: [
          q05("espanol-a2-u05-s02-1", "Te ___ que pruebes este plato.", ["recomiendo", "recomendé", "recomendar", "recomendaba"], 0, "Opiniones y consejos"),
          q07("espanol-a2-u05-s02-2", "Deberías llevar un paraguas.", ["你应该带伞", "今天很热", "我不需要伞", "下雨了"], 0, "Opiniones y consejos"),
          q10("espanol-a2-u05-s02-3", "Es mejor tomar el metro.", ["最好坐地铁", "最好打车", "走路就行"], "Opiniones y consejos"),
          q12("espanol-a2-u05-s02-4", "新同事迷路了，你想建议他用手机地图。", ["Te recomiendo usar el mapa del móvil.", "Sigue recto siempre.", "No sé la dirección.", "Vuelve a casa."], 0, "Opiniones y consejos"),
        ],
      },
      {
        id: "S03",
        titleNative: "偏好与选择",
        titleTarget: "Preferencias",
        questions: [
          q05("espanol-a2-u05-s03-1", "Prefiero el té ___ el café.", ["a", "de", "en", "con"], 0, "Opiniones y consejos"),
          q07("espanol-a2-u05-s03-2", "Me gusta más vivir cerca del centro.", ["我更喜欢住在市中心附近", "我喜欢郊区", "我住得很远", "正在搬家"], 0, "Opiniones y consejos"),
          q06("espanol-a2-u05-s03-3", ["Prefiero", "estudiar", "por", "la", "mañana."], "Prefiero estudiar por la mañana.", "Opiniones y consejos"),
          q12("espanol-a2-u05-s03-4", "朋友问想看喜剧还是纪录片，你想说更想看喜剧。", ["Prefiero ver una comedia.", "Prefiero documentales.", "No quiero ver nada.", "Ya vimos una película."], 0, "Opiniones y consejos"),
        ],
      },
      {
        id: "S04",
        titleNative: "观点场景综合",
        titleTarget: "Práctica integral",
        questions: [
          q08("espanol-a2-u05-s04-1", "En mi opinión, es una buena idea.", "¿Qué expresa?", ["Opina que es buena idea", "No tiene opinión", "Es mala idea", "No entiende"], 0, "Opiniones y consejos"),
          q03("espanol-a2-u05-s04-2", [
            { left: "creo que", right: "我认为" },
            { left: "me parece", right: "我觉得" },
            { left: "prefiero", right: "我更喜欢" },
            { left: "deberías", right: "你应该" },
          ], "Opiniones y consejos"),
          q07("espanol-a2-u05-s04-3", "No estoy de acuerdo con esa decisión.", ["我不同意那个决定", "我同意", "决定很好", "没有问题"], 0, "Opiniones y consejos"),
          q12("espanol-a2-u05-s04-4", "小组讨论是否换办公室，你想说觉得现在的位置更方便。", ["Creo que la ubicación actual es más conveniente.", "Cambiemos ya.", "No tengo opinión.", "Odio la oficina."], 0, "Opiniones y consejos"),
        ],
      },
    ],
  },
  {
    id: "U06",
    titleNative: "社交与邀请",
    titleTarget: "Socializar e invitaciones",
    goalNative: "发出和接受邀请，电话沟通，描述社交活动",
    goalTarget: "Hacer y aceptar invitaciones, comunicarse por teléfono",
    sections: [
      {
        id: "S01",
        titleNative: "邀请与回应",
        titleTarget: "Invitaciones y respuestas",
        questions: [
          q05("espanol-a2-u06-s01-1", "¿Quieres ___ a mi fiesta el sábado?", ["venir", "veniré", "viniste", "venías"], 0, "Socializar e invitaciones"),
          q07("espanol-a2-u06-s01-2", "¿Te apetece tomar un café?", ["你想喝杯咖啡吗", "咖啡很贵", "我不喝咖啡", "咖啡好了"], 0, "Socializar e invitaciones"),
          q12("espanol-a2-u06-s01-3", "同学邀请你参加生日聚会，你想接受并问几点开始。", ["Claro, ¿a qué hora empieza la fiesta?", "No puedo ir nunca.", "Ya fui ayer.", "No me gustan las fiestas."], 0, "Socializar e invitaciones"),
          q08("espanol-a2-u06-s01-4", "¿Podemos quedar a las siete en la plaza?", "¿Qué propone?", ["Quedar a las siete en la plaza", "Quedar mañana por la mañana", "No quedar nunca", "Ir al cine solo"], 0, "Socializar e invitaciones"),
        ],
      },
      {
        id: "S02",
        titleNative: "电话与消息",
        titleTarget: "Teléfono y mensajes",
        questions: [
          q05("espanol-a2-u06-s02-1", "¿___ llamarme más tarde, por favor?", ["Puedes", "Pudiste", "Podrás", "Podías"], 0, "Socializar e invitaciones"),
          q07("espanol-a2-u06-s02-2", "No puedo contestar ahora, te escribo luego.", ["现在接不了，稍后回你", "请立即回复", "我在打电话", "手机坏了"], 0, "Socializar e invitaciones"),
          q10("espanol-a2-u06-s02-3", "¿Está disponible la señora García?", ["加西亚夫人在吗", "加西亚夫人出去了", "我是加西亚"], "Socializar e invitaciones"),
          q12("espanol-a2-u06-s02-4", "接电话时你想说自己是李明，找安娜。", ["Hola, soy Li Ming, busco a Ana.", "Soy Ana.", "No conozco a Ana.", "Adiós."], 0, "Socializar e invitaciones"),
        ],
      },
      {
        id: "S03",
        titleNative: "庆祝与活动",
        titleTarget: "Celebraciones y eventos",
        questions: [
          q05("espanol-a2-u06-s03-1", "Vamos a ___ el cumpleaños de Laura.", ["celebrar", "celebré", "celebraba", "celebrado"], 0, "Socializar e invitaciones"),
          q07("espanol-a2-u06-s03-2", "Felicitamos a los novios en la boda.", ["我们在婚礼上祝贺新人", "婚礼取消了", "我不参加", "昨天结婚了"], 0, "Socializar e invitaciones"),
          q06("espanol-a2-u06-s03-3", ["¿Quieres", "venir", "a", "la", "fiesta", "conmigo?"], "¿Quieres venir a la fiesta conmigo?", "Socializar e invitaciones"),
          q12("espanol-a2-u06-s03-4", "你想邀请同事下班后一起去喝一杯。", ["¿Te apetece tomar algo después del trabajo?", "Trabaja más.", "No bebo nunca.", "Adiós."], 0, "Socializar e invitaciones"),
        ],
      },
      {
        id: "S04",
        titleNative: "社交综合",
        titleTarget: "Práctica integral social",
        questions: [
          q08("espanol-a2-u06-s04-1", "Gracias por la invitación, llegaré puntual.", "¿Qué hará?", ["Llegará puntual", "No irá", "Llegará tarde", "Ya se fue"], 0, "Socializar e invitaciones"),
          q07("espanol-a2-u06-s04-2", "Lo siento, no puedo asistir a la reunión.", ["抱歉，我无法参加会议", "我会参加", "会议很好", "明天见"], 0, "Socializar e invitaciones"),
          q03("espanol-a2-u06-s04-3", [
            { left: "¿Te apetece?", right: "你想…吗" },
            { left: "quedar", right: "约见面" },
            { left: "felicitar", right: "祝贺" },
            { left: "invitar", right: "邀请" },
          ], "Socializar e invitaciones"),
          q12("espanol-a2-u06-s04-4", "朋友临时取消约会，你想礼貌表示理解并提议改期。", ["No pasa nada, ¿quedamos otro día?", "Estoy muy enfadado.", "No hablemos más.", "Adiós para siempre."], 0, "Socializar e invitaciones"),
        ],
      },
    ],
  },
];

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

const CHOICE_TYPES = new Set(['T05', 'T07', 'T08', 'T12']);

function shuffleQuestionOptions(q) {
  if (!CHOICE_TYPES.has(q.type)) return q;
  const opts = [...q.options];
  const correct = opts[q.answerIdx];
  fisherYates(opts);
  const newIdx = opts.indexOf(correct);
  const out = { ...q, options: opts, answerIdx: newIdx };
  if (q.type === 'T05' && q.blank !== undefined) {
    out.blank = correct;
  }
  return out;
}

function collectQuestions(units) {
  const out = [];
  for (const unit of units) {
    for (const section of unit.sections) {
      for (const q of section.questions) {
        out.push(shuffleQuestionOptions(q));
      }
    }
  }
  return out;
}

const questions = collectQuestions(UNITS);

// Validate counts
const sectionCount = UNITS.reduce((n, u) => n + u.sections.length, 0);
const qPerSection = UNITS.flatMap((u) => u.sections.map((s) => s.questions.length));
if (sectionCount !== 24) throw new Error(`Expected 24 sections, got ${sectionCount}`);
if (questions.length !== 96) throw new Error(`Expected 96 questions, got ${questions.length}`);
if (qPerSection.some((n) => n !== 4)) throw new Error(`Each section must have 4 questions: ${qPerSection.join(",")}`);

const allowed = new Set(["T05", "T07", "T08", "T12", "T06", "T10", "T03"]);
for (const q of questions) {
  if (!allowed.has(q.type)) throw new Error(`Disallowed type ${q.type} in ${q.id}`);
}

const seed = { units: UNITS, questions };
writeFileSync(OUT, JSON.stringify(seed, null, 2), "utf8");
console.log(`Wrote ${OUT}`);
console.log(`Units: ${UNITS.length}, Sections: ${sectionCount}, Questions: ${questions.length}`);
