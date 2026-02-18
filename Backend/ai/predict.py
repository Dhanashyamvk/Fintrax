# LightGBM AI Model
import pickle
import sys
import os
import numpy as np
from scipy.sparse import hstack
from insights import generate_insight
import warnings
warnings.filterwarnings("ignore")
from recommender import generate_recommendation

BASE_DIR = os.path.dirname(__file__)
model_path = os.path.join(BASE_DIR, "model.pkl")

model, vectorizer = pickle.load(open(model_path,"rb"))

desc = sys.argv[1]
amount = float(sys.argv[2])
month = int(sys.argv[3])

X_text = vectorizer.transform([desc])
X_num = np.array([[amount, month]])
X = hstack([X_text, X_num])

future_model = pickle.load(open(os.path.join(BASE_DIR,"future_model.pkl"),"rb"))

category = model.predict(X)[0]
confidence = model.predict_proba(X).max()

insight = generate_insight(category, amount, confidence)
recommendation = generate_recommendation(category, confidence, amount)

future_spend = future_model.predict([[amount, month]])[0]

print(f"{category}|{confidence:.2f}|{future_spend:.2f}|{insight}|{recommendation}")
