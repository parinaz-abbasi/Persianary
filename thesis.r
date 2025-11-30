all_data1 <- readRDS(("/Users/parinazabbasi/Downloads//data_AUG.RDS"))
library(ggplot2) 
library(readr)   
library(dplyr)
library(readr)  

data_sb <- all_data1[, c("subject", "course", "ID", "school", "WhenCanada", "GenderIdentity", "FinalExam", "Racialization", "SocialBelongingMid_1.mid", "SocialBelongingMid_2.mid", "SocialBelongingMid_3.mid", "SocialBelongingMid_4.mid", "SocialBelongingMid_5.mid", "SocialBelongingMid_6.mid", "SocialBelongingMid_7.mid","SocialBelongingMid_8.mid", "SocialBelongingMid_9.mid", "SocialBelongingMid_10.mid", "Social\nBelonging.Score.mid")]

