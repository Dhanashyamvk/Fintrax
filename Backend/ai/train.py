import pandas as pd
import lightgbm as lgb
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor
import pickle
import os
from scipy.sparse import hstack

BASE_DIR = os.path.dirname(__file__)
csv_path = os.path.join(BASE_DIR, "transactions.csv")

data = pd.read_csv(csv_path)

vectorizer = TfidfVectorizer()
X_text = vectorizer.fit_transform(data["description"])

X_num = data[["amount","month"]].values
X = hstack([X_text, X_num])
y = data["category"]

model = lgb.LGBMClassifier(
    min_data_in_leaf=1,
    min_data_in_bin=1,
    verbose=-1
)

model.fit(X,y)

pickle.dump((model, vectorizer),
            open(os.path.join(BASE_DIR,"model.pkl"),"wb"))

future_X = data[["amount","month"]]
future_y = data["amount"]  

future_model = RandomForestRegressor()
future_model.fit(future_X, future_y)

pickle.dump(future_model,
            open(os.path.join(BASE_DIR,"future_model.pkl"),"wb"))

print("AI upgraded with future prediction")