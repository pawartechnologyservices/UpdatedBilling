import Layout from "@/components/Layout";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { useBilling } from "@/contexts/BillingContext";
import { auth, database } from "@/firebase/firebaseConfig";
import PlanModal from "@/pages/PlanModal";
import CryptoJS from "crypto-js";
import { getAuth } from "firebase/auth";
import { get, onValue, push, ref, remove, set } from "firebase/database";
import { Plus, Trash } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const SECRET_KEY = "your-very-secure-secret-key";

const encrypt = (value) => {
  return CryptoJS.AES.encrypt(value, SECRET_KEY).toString();
};

const decrypt = (cipherText) => {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return cipherText;
  }
};

const Categories = () => {
  const { t } = useTranslation("categories");
  const { categories, addCategory, deleteCategory, products } = useBilling();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const navigate = useNavigate();

  const checkLimits = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return true;

    const configRef = ref(database, `users/${user.uid}/businessConfig`);
    const categoryRef = ref(database, `users/${user.uid}/categories`);

    try {
      const [configSnap, collectionSnap] = await Promise.all([
        get(configRef),
        get(categoryRef)
      ]);

      const limit = configSnap.val()?.categoryLimit || 5;
      const currentCount = collectionSnap.exists() ? Object.keys(collectionSnap.val()).length : 0;

      if (currentCount >= limit) {
        setShowUpgradeDialog(true);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Error checking limits:", err);
      return true;
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const userRef = ref(database, `users/${user.uid}/business/active`);

    const unsubscribe = onValue(userRef, (snapshot) => {
      const isActive = snapshot.exists() ? snapshot.val() : false;

      if (!isActive) {
        auth.signOut().then(() => {
          navigate("/login", {
            state: { accountDisabled: true },
            replace: true
          });
          toast({
            title: t("account_disabled"),
            description: t("account_disabled_msg"),
            variant: "destructive",
          });
        });
      }
    });

    return () => unsubscribe();
  }, [navigate, t]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCategoryName.trim()) {
      toast({
        title: t("please_enter"),
        variant: "destructive"
      });
      return;
    }

    const categoryExists = categories.some(
      cat => decrypt(cat.name).toLowerCase() === newCategoryName.toLowerCase()
    );

    if (categoryExists) {
      toast({
        title: t("category_exists"),
        variant: "destructive"
      });
      return;
    }

    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      toast({
        title: t("category_failed"),
        variant: "destructive"
      });
      return;
    }

    const canAdd = await checkLimits();
    if (!canAdd) return;

    const categoryRef = ref(database, `users/${user.uid}/categories`);
    const newCategoryRef = push(categoryRef);
    const id = newCategoryRef.key!;

    try {
      await set(newCategoryRef, {
        id,
        name: encrypt(newCategoryName)
      });

      setNewCategoryName("");
      toast({
        title: t("category_added"),
        variant: "default"
      });
    } catch (err) {
      toast({
        title: t("category_failed"),
        variant: "destructive"
      });
      console.error(err);
    }
  };

  const getProductCount = (categoryId: string) => {
    return products.filter(product => product.category === categoryId).length;
  };

  const canDeleteCategory = (categoryId: string) => {
    return getProductCount(categoryId) === 0;
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-billing-dark dark:text-white">
          {t("categories")}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("all_categories")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("products")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length > 0 ? (
                    categories.map(category => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{decrypt(category.name)}</TableCell>
                        <TableCell>{getProductCount(category.id)}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-billing-danger"
                                disabled={!canDeleteCategory(category.id)}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("delete_category")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("delete_confirm", { name: decrypt(category.name) })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-billing-danger hover:bg-red-600"
                                  onClick={async () => {
                                    try {
                                      const auth = getAuth();
                                      const user = auth.currentUser;
                                      if (!user) {
                                        toast({
                                          title: t("category_delete_failed"),
                                          variant: "destructive"
                                        });
                                        return;
                                      }

                                      const categoryRef = ref(database, `users/${user.uid}/categories/${category.id}`);
                                      await remove(categoryRef);

                                      deleteCategory(category.id);
                                      toast({
                                        title: t("category_deleted"),
                                        variant: "default"
                                      });
                                    } catch (err) {
                                      toast({
                                        title: t("category_delete_failed"),
                                        variant: "destructive"
                                      });
                                      console.error(err);
                                    }
                                  }}
                                >
                                  {t("delete_action")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-billing-secondary">
                        {t("no_categories")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>{t("add_new_category")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="categoryName">{t("category_name")}</Label>
                  <Input
                    id="categoryName"
                    placeholder={t("enter_category_name")}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> {t("add_category")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t("category_tips")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-billing-secondary space-y-2">
              <p>{t("tips_1")}</p>
              <p>{t("tips_2")}</p>
              <p>{t("tips_3")}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <PlanModal
        isOpen={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
      />
    </Layout>
  );
};

export default Categories;
