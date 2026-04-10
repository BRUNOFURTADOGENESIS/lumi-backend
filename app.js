require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Banco de dados
const db = new sqlite3.Database(process.env.DB_PATH || './database/lumi_coach.db');

// Dados nutricionais
const nutritionData = require('./database/nutrition.json');

// Extrair alimentos do texto
function extractFoods(text) {
  const foods = [];
  const foodNames = Object.keys(nutritionData.alimentos);
  
  foodNames.forEach(food => {
    if (text.toLowerCase().includes(food)) {
      foods.push(food);
    }
  });
  
  return foods;
}

// Calcular nutrição
function calculateNutrition(foods) {
  let totalCalories = 0;
  let totalProteins = 0;
  let totalCarbs = 0;
  let totalFats = 0;
  
  foods.forEach(foodName => {
    const food = nutritionData.alimentos[foodName];
    if (food) {
      totalCalories += food.calories;
      totalProteins += food.proteins;
      totalCarbs += food.carbs;
      totalFats += food.fats;
    }
  });

  return {
    calories: totalCalories,
    proteins: totalProteins,
    carbs: totalCarbs,
    fats: totalFats
  };
}

// Gerar resposta motivacional
function generateMotivationalResponse(calories, userGoal) {
  const percentage = (calories / userGoal) * 100;
  
  if (percentage <= 100) {
    const messages = [
      `Boa! Você está dentro da meta hoje 💪`,
      `Perfeito! Continue assim! 🎯`,
      `Ótimo trabalho! Mantém o foco! 🔥`,
      `Excelente! Dentro da meta! 🌟`
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  } else {
    const excess = calories - userGoal;
    return `Cuidado, passou ${excess} kcal 👀`;
  }
}

// Rota para webhook do WhatsApp
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const message = req.body;
    const phone = message.phone || 'test';
    const text = message.text || 'comi arroz e feijão';
    
    console.log('Mensagem recebida:', phone, text);

    const foods = extractFoods(text);
    
    if (foods.length === 0) {
      return res.json({
        response: 'Não consegui identificar alimentos na sua mensagem. Tente ser mais específico! 🤔'
      });
    }

    const nutrition = calculateNutrition(foods);
    const motivational = generateMotivationalResponse(nutrition.calories, 2000);
    
    let fullResponse = `${motivational}\n\n`;
    fullResponse += `📊 Refeição: ${nutrition.calories} kcal\n`;
    fullResponse += `💪 Proteínas: ${nutrition.proteins.toFixed(1)}g\n`;
    fullResponse += `🍞 Carboidratos: ${nutrition.carbs.toFixed(1)}g\n`;
    fullResponse += `🥑 Gorduras: ${nutrition.fats.toFixed(1)}g`;

    res.json({
      response: fullResponse,
      nutrition: nutrition,
      foods: foods
    });

  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: 'Error processing message' });
  }
});

// Rota para dashboard
app.get('/api/dashboard/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const mockData = {
      user: {
        phone: phone,
        dailyCalorieGoal: 2000,
        isPremium: false,
        interactionsCount: 3
      },
      today: {
        calories: 450,
        proteins: 25.5,
        carbs: 65.2,
        fats: 8.9
      },
      weekly: [
        { date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), calories: 1800 },
        { date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), calories: 2100 },
        { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), calories: 1950 },
        { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), calories: 2200 },
        { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), calories: 1900 },
        { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), calories: 2050 },
        { date: new Date().toISOString(), calories: 450 }
      ]
    };

    res.json(mockData);
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Lumi Coach Bot Backend rodando na porta ${PORT}`);
  console.log(`📱 Teste webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`🔍 API: http://localhost:${PORT}/api`);
});

module.exports = app;
