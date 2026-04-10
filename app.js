require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const nutritionData = require('./database/nutrition.json');

function extractFoods(text) {
  const foods = [];
  const foodNames = Object.keys(nutritionData.alimentos);
  foodNames.forEach(food => {
    if (text.toLowerCase().includes(food)) foods.push(food);
  });
  return foods;
}

function calculateNutrition(foods) {
  let totalCalories = 0, totalProteins = 0, totalCarbs = 0, totalFats = 0;
  foods.forEach(foodName => {
    const food = nutritionData.alimentos[foodName];
    if (food) {
      totalCalories += food.calories;
      totalProteins += food.proteins;
      totalCarbs += food.carbs;
      totalFats += food.fats;
    }
  });
  return { calories: totalCalories, proteins: totalProteins, carbs: totalCarbs, fats: totalFats };
}

function generateMotivationalResponse(calories, userGoal) {
  const percentage = (calories / userGoal) * 100;
  if (percentage <= 100) {
    const messages = ['Boa! Você está dentro da meta hoje 💪','Perfeito! Continue assim! 🎯','Ótimo trabalho! Mantém o foco! 🔥','Excelente! Dentro da meta! 🌟'];
    return messages[Math.floor(Math.random() * messages.length)];
  } else {
    return `Cuidado, passou ${calories - userGoal} kcal 👀`;
  }
}

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { phone = 'test', text = 'comi arroz e feijão' } = req.body;
    const foods = extractFoods(text);
    if (foods.length === 0) return res.json({ response: 'Não consegui identificar alimentos na sua mensagem. Tente ser mais específico! 🤔' });
    const nutrition = calculateNutrition(foods);
    const motivational = generateMotivationalResponse(nutrition.calories, 2000);
    let fullResponse = `${motivational}\n\n`;
    fullResponse += `📊 Refeição: ${nutrition.calories} kcal\n`;
    fullResponse += `💪 Proteínas: ${nutrition.proteins.toFixed(1)}g\n`;
    fullResponse += `🍞 Carboidratos: ${nutrition.carbs.toFixed(1)}g\n`;
    fullResponse += `🥑 Gorduras: ${nutrition.fats.toFixed(1)}g`;
    res.json({ response: fullResponse, nutrition, foods });
  } catch (error) {
    res.status(500).json({ error: 'Error processing message' });
  }
});

app.get('/api/dashboard/:phone', async (req, res) => {
  try {
    res.json({
      user: { phone: req.params.phone, dailyCalorieGoal: 2000, isPremium: false, interactionsCount: 3 },
      today: { calories: 450, proteins: 25.5, carbs: 65.2, fats: 8.9 },
      weekly: [
        { date: new Date(Date.now() - 6*24*60*60*1000).toISOString(), calories: 1800 },
        { date: new Date(Date.now() - 5*24*60*60*1000).toISOString(), calories: 2100 },
        { date: new Date(Date.now() - 4*24*60*60*1000).toISOString(), calories: 1950 },
        { date: new Date(Date.now() - 3*24*60*60*1000).toISOString(), calories: 2200 },
        { date: new Date(Date.now() - 2*24*60*60*1000).toISOString(), calories: 1900 },
        { date: new Date(Date.now() - 1*24*60*60*1000).toISOString(), calories: 2050 },
        { date: new Date().toISOString(), calories: 450 }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

app.listen(PORT, () => console.log(`🚀 Lumi Coach Bot rodando na porta ${PORT}`));
module.exports = app;
