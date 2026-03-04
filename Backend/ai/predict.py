import pickle
import sys
import os
import numpy as np
from scipy.sparse import hstack
from recommender import generate_recommendation
import warnings
import datetime
import sys
sys.stdout.reconfigure(encoding='utf-8')

warnings.filterwarnings("ignore")

BASE_DIR = os.path.dirname(__file__)

model, vectorizer = pickle.load(open(os.path.join(BASE_DIR,"model.pkl"),"rb"))
future_model = pickle.load(open(os.path.join(BASE_DIR,"future_model.pkl"),"rb"))

# -------- INPUT --------

desc = sys.argv[1].lower().strip()
amount = float(sys.argv[2])
month = int(sys.argv[3])

try:
    spent = float(sys.argv[4])
except:
    spent = 0

try:
    budget = float(sys.argv[5])
except:
    budget = 0

# clean description
desc = desc.replace("-", " ")
desc = desc.replace("_", " ")

# -------- FEATURE BUILD --------

X_text = vectorizer.transform([desc])
X_num = np.array([[amount, month]])
X = hstack([X_text, X_num])

# -------- CATEGORY PREDICTION --------

food_words = ["zomato","swiggy","kfc","dominos","pizza","burger","restaurant","cafe","coffee","starbucks","meal"]
travel_words = ["uber","ola","train","flight","airport","bus","metro","taxi"]
shopping_words = ["amazon","flipkart","myntra","ajio","shopping","mall"]
utility_words = ["electricity","water","gas","broadband","internet","wifi","recharge"]

rule_based = False

if any(word in desc for word in food_words):
    category = "Food"
    rule_based = True

elif any(word in desc for word in travel_words):
    category = "Travel"
    rule_based = True

elif any(word in desc for word in shopping_words):
    category = "Shopping"
    rule_based = True

elif any(word in desc for word in utility_words):
    category = "Utilities"
    rule_based = True

else:
    category = model.predict(X)[0]

# -------- CATEGORY VALIDATION --------

allowed = ["Food","Travel","Groceries","Tech","Utilities","Shopping","Other"]

if category not in allowed:
    category = "Other"

# -------- CONFIDENCE --------

try:
    confidence = float(model.predict_proba(X)[0].max())
except:
    confidence = 0.80 if rule_based else 0.50

# -------- AI INSIGHTS --------

new_spent = spent + amount
recommendation = generate_recommendation(category, confidence, amount, new_spent, budget)

# -------- FUTURE PREDICTION --------

current_total = spent + amount

today = datetime.datetime.now()

days_passed = today.day
days_in_month = 30

if days_passed < 1:
    days_passed = 1

daily_avg = current_total / days_passed

future_spend = daily_avg * days_in_month

future_spend = round(future_spend, 2)

# avoid division by zero
if days_passed == 0:
    days_passed = 1

daily_avg = current_total / days_passed
future_spend = daily_avg * days_in_month

future_spend = round(future_spend, 2)

# -------- OUTPUT --------

recommendation = recommendation.replace("⚠","")
print(f"{category}|{confidence:.2f}|{future_spend:.2f}|{recommendation}")
