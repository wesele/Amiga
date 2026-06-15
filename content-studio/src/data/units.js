/**
 * 单元定义 - 基于 content structure 规范
 * A1: 6 个单元，A2: 4 个单元
 */

export const UNITS = {
  A1: [
    {
      id: 'A1-U1',
      unit: 'U1',
      cefr: 'A1',
      title: 'Saludos y cortesía',
      titleCN: '问候与礼貌',
      questionCount: 19,
      types: ['T01', 'T02', 'T03'],
      vocabulary: [
        'hola', 'adiós', 'buenos días', 'buenas tardes', 'buenas noches',
        'gracias', 'por favor', 'perdón', 'lo siento', 'de nada',
        'hasta luego', 'hasta mañana', 'bien', 'mal', 'así así',
        '¿Cómo estás?', 'Estoy bien', 'Muy bien', '¿Y tú?',
        'disculpe', 'chao', 'nos vemos'
      ],
      grammar: ['基本问候句型', '正式/非正式用语区别']
    },
    {
      id: 'A1-U2',
      unit: 'U2',
      cefr: 'A1',
      title: 'Alfabeto, números y tiempo',
      titleCN: '字母、数字与时间',
      questionCount: 21,
      types: ['T01', 'T02', 'T03', 'T05', 'T06', 'T07'],
      vocabulary: [
        'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
        'once', 'doce', 'quince', 'veinte', 'treinta', 'cincuenta', 'cien',
        'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
        'hora', 'minuto', 'media', 'cuarto', 'en punto'
      ],
      grammar: ['ser 用于日期/时间', '¿Qué hora es? 句型', '数字表达']
    },
    {
      id: 'A1-U3',
      unit: 'U3',
      cefr: 'A1',
      title: 'Comida y bebida',
      titleCN: '餐饮食物',
      questionCount: 22,
      types: ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08'],
      vocabulary: [
        'pan', 'arroz', 'pescado', 'fruta', 'verdura', 'huevo', 'carne', 'sopa',
        'ensalada', 'café', 'té', 'leche', 'agua', 'cerveza', 'vino', 'zumo',
        'desayuno', 'comida', 'cena', 'postre',
        'querer', 'beber', 'comer', 'gustar',
        'dulce', 'salado', 'picante', 'amargo',
        'caliente', 'frío', 'delicioso', 'cuenta'
      ],
      grammar: ['querer + 名词', 'estar + 形容词', '¿Cuánto cuesta? 句型']
    },
    {
      id: 'A1-U4',
      unit: 'U4',
      cefr: 'A1',
      title: 'Compras y colores',
      titleCN: '购物与颜色',
      questionCount: 22,
      types: ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08'],
      vocabulary: [
        'camisa', 'pantalones', 'zapatos', 'sombrero', 'vestido', 'falda',
        'rojo', 'azul', 'verde', 'negro', 'blanco', 'amarillo',
        'caro', 'barato', 'grande', 'pequeño',
        'comprar', 'vender', 'pagar', 'llevar', 'probar',
        'talla', 'probador', 'dinero', 'euro', 'tarjeta',
        'tienda', 'mercado', 'precio'
      ],
      grammar: ['¿Cuánto cuesta? 句型', 'poder + infinitivo', 'gustar + plural']
    },
    {
      id: 'A1-U5',
      unit: 'U5',
      cefr: 'A1',
      title: 'Direcciones y transporte',
      titleCN: '问路与交通',
      questionCount: 22,
      types: ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08'],
      vocabulary: [
        'escuela', 'hospital', 'parque', 'banco', 'restaurante', 'museo', 'farmacia',
        'autobús', 'metro', 'tren', 'avión', 'coche', 'taxi', 'bici',
        'izquierda', 'derecha', 'recto', 'esquina',
        'cerca', 'lejos', 'al lado de', 'detrás de', 'delante de',
        'estación', 'aeropuerto', 'parada', 'calle', 'plaza'
      ],
      grammar: ['¿Dónde está...?', 'ir + en + 交通工具', 'direcciones 指路表达']
    },
    {
      id: 'A1-U6',
      unit: 'U6',
      cefr: 'A1',
      title: 'Rutina diaria',
      titleCN: '日常活动',
      questionCount: 23,
      types: ['T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10'],
      vocabulary: [
        'comer', 'dormir', 'leer', 'escribir', 'correr', 'caminar',
        'hablar', 'escuchar', 'ver', 'estudiar', 'trabajar', 'vivir',
        'siempre', 'nunca', 'a veces', 'a menudo', 'todos los días',
        'desayuno', 'almuerzo', 'cena', 'merienda',
        'mañana', 'tarde', 'noche', 'levantarse', 'acostarse'
      ],
      grammar: ['现在时动词变位 (-ar/-er/-ir)', '频率副词位置', 'levantarse 等代词式动词']
    }
  ],
  A2: [
    {
      id: 'A2-U1',
      unit: 'U1',
      cefr: 'A2',
      title: 'Pasado y futuro',
      titleCN: '过去与未来',
      questionCount: 19,
      types: ['T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'],
      vocabulary: [
        'ayer', 'hoy', 'mañana', 'ahora', 'antes', 'después',
        'el año pasado', 'la semana pasada', 'el mes pasado',
        'la semana que viene', 'el mes que viene', 'el año que viene',
        'viajar', 'visitar', 'empezar', 'terminar', 'ir', 'venir',
        'examen', 'fiesta', 'cine', 'médico'
      ],
      grammar: ['简单过去时 (pretérito indefinido)', 'ir a + infinitivo 表将来', '时间标记词']
    },
    {
      id: 'A2-U2',
      unit: 'U2',
      cefr: 'A2',
      title: 'Gustos y aficiones',
      titleCN: '爱好与兴趣',
      questionCount: 18,
      types: ['T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'],
      vocabulary: [
        'música', 'deporte', 'viajar', 'cocinar', 'leer', 'bailar',
        'cine', 'teatro', 'fútbol', 'gimnasio', 'yoga',
        'gustar', 'encantar', 'preferir', 'odiar',
        'mucho', 'poco', 'nada', 'bastante', 'demasiado',
        'animal', 'película', 'serie', 'libro', 'juego'
      ],
      grammar: ['gustar/encantar 句型', 'preferir + A + B 比较', '程度副词']
    },
    {
      id: 'A2-U3',
      unit: 'U3',
      cefr: 'A2',
      title: 'Familia y personas',
      titleCN: '家庭与人际',
      questionCount: 18,
      types: ['T01', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'],
      vocabulary: [
        'familia', 'padre', 'madre', 'hermano', 'hermana',
        'abuelo', 'abuela', 'tío', 'tía', 'primo', 'prima',
        'hijo', 'hija', 'sobrino', 'sobrina',
        'novio', 'novia', 'amigo', 'vecino', 'compañero',
        'presentar', 'conocer', 'llevarse bien', 'Mucho gusto'
      ],
      grammar: ['tener + 年龄', 'se parece a 比较句型', '家庭成员描述']
    },
    {
      id: 'A2-U4',
      unit: 'U4',
      cefr: 'A2',
      title: 'Tiempo y naturaleza',
      titleCN: '天气与自然',
      questionCount: 18,
      types: ['T01', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'],
      vocabulary: [
        'sol', 'lluvia', 'nieve', 'viento', 'nube', 'tormenta',
        'primavera', 'verano', 'otoño', 'invierno',
        'temperatura', 'grados', 'calor', 'frío',
        'hacer buen tiempo', 'hacer mal tiempo',
        'llover', 'nevar', 'montaña', 'playa', 'río', 'bosque',
        'norte', 'sur', 'este', 'oeste'
      ],
      grammar: ['hacer + 天气表达', 'estar + gerundio 进行时', '季节与月份']
    }
  ]
}

export function getAllUnits() {
  return [...UNITS.A1, ...UNITS.A2]
}

export function getUnit(id) {
  return getAllUnits().find(u => u.id === id)
}

export function getUnitsByCEFR(cefr) {
  return UNITS[cefr] || []
}

export default UNITS
